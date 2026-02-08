import { inngest } from '../client';
import { getDb } from '@/lib/db';
import {
  projects,
  trackedKeywords,
  queryRuns,
  queryResults,
  organizations,
} from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getAdapter } from '@/lib/engines';
import { getPlanLimits, canUseEngine } from '@/lib/billing/plan-limits';
import type { EngineType, SubscriptionTier } from '@/types';

// Daily cron: fan out monitoring for all active projects
export const scheduledMonitor = inngest.createFunction(
  {
    id: 'scheduled-keyword-monitor',
    concurrency: { limit: 3 },
  },
  { cron: '0 6 * * *' }, // 6 AM UTC daily
  async ({ step }) => {
    const db = getDb();

    const activeProjects = await step.run('load-active-projects', async () => {
      const results = await db
        .select({
          projectId: projects.id,
          tier: organizations.subscriptionTier,
        })
        .from(projects)
        .innerJoin(organizations, eq(projects.organizationId, organizations.id))
        .where(
          inArray(organizations.subscriptionStatus, ['active', 'trialing']),
        );
      return results;
    });

    // Fan out: send an event per project
    for (const project of activeProjects) {
      const tier = project.tier as SubscriptionTier;
      const limits = getPlanLimits(tier);

      // Create a queryRun for this project
      const queryRun = await step.run(
        `create-run-${project.projectId}`,
        async () => {
          // Get active keyword count
          const keywords = await db
            .select({ id: trackedKeywords.id })
            .from(trackedKeywords)
            .where(
              and(
                eq(trackedKeywords.projectId, project.projectId),
                eq(trackedKeywords.isActive, true),
              ),
            );

          if (keywords.length === 0) return null;

          const engineTypes = limits.engines.filter((e) =>
            canUseEngine(tier, e),
          );

          const [run] = await db
            .insert(queryRuns)
            .values({
              projectId: project.projectId,
              status: 'pending',
              engineTypes: engineTypes as [EngineType, ...EngineType[]],
              totalKeywords: keywords.length,
            })
            .returning();

          return {
            queryRunId: run.id,
            engineTypes,
            keywordIds: keywords.map((k) => k.id),
          };
        },
      );

      if (queryRun) {
        await step.sendEvent(`trigger-${project.projectId}`, {
          name: 'monitoring/run.triggered',
          data: {
            projectId: project.projectId,
            queryRunId: queryRun.queryRunId,
            engineTypes: queryRun.engineTypes,
            keywordIds: queryRun.keywordIds,
          },
        });
      }
    }

    return { projectsTriggered: activeProjects.length };
  },
);

// Event-triggered: run monitoring for a single project
export const keywordMonitor = inngest.createFunction(
  {
    id: 'keyword-monitor',
    concurrency: { limit: 3 },
    retries: 3,
  },
  { event: 'monitoring/run.triggered' },
  async ({ event, step }) => {
    const { projectId, queryRunId, engineTypes, keywordIds } = event.data;
    const db = getDb();

    // Step 1: Fetch keywords and project details
    const context = await step.run('fetch-keywords', async () => {
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) throw new Error(`Project not found: ${projectId}`);

      // Get the org's subscription tier
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, project.organizationId))
        .limit(1);

      if (!org) throw new Error(`Organization not found for project: ${projectId}`);

      // Load keywords
      const keywords =
        keywordIds.length > 0
          ? await db
              .select()
              .from(trackedKeywords)
              .where(
                and(
                  eq(trackedKeywords.projectId, projectId),
                  inArray(trackedKeywords.id, keywordIds),
                  eq(trackedKeywords.isActive, true),
                ),
              )
          : await db
              .select()
              .from(trackedKeywords)
              .where(
                and(
                  eq(trackedKeywords.projectId, projectId),
                  eq(trackedKeywords.isActive, true),
                ),
              );

      const tier = org.subscriptionTier as SubscriptionTier;
      const limits = getPlanLimits(tier);

      // Update queryRun to running
      await db
        .update(queryRuns)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(queryRuns.id, queryRunId));

      return {
        project: {
          id: project.id,
          domain: project.domain,
          brandName: project.brandName,
          brandAliases: project.brandAliases || [],
        },
        keywords: keywords.map((k) => ({ id: k.id, keyword: k.keyword })),
        tier,
        runsPerKeyword: limits.runsPerKeyword,
      };
    });

    // Step 2: Query engines — each keyword × engine × run as separate step
    let completedCount = 0;
    let failedCount = 0;

    // Filter to only engines that are available for the tier
    const validEngines = (engineTypes as EngineType[]).filter((e) =>
      canUseEngine(context.tier, e),
    );

    for (const keyword of context.keywords) {
      for (const engineType of validEngines) {
        for (let runNum = 0; runNum < context.runsPerKeyword; runNum++) {
          const stepId = `query-${keyword.id}-${engineType}-${runNum}`;

          try {
            await step.run(stepId, async () => {
              const adapter = getAdapter(engineType);
              const result = await adapter.query(keyword.keyword);

              // Store the result in the database
              await db.insert(queryResults).values({
                queryRunId,
                projectId,
                keywordId: keyword.id,
                engineType: result.engineType,
                rawResponse: result.rawResponse,
                responseMetadata: result.responseMetadata,
                citationUrls: result.citationUrls,
              });
            });

            completedCount++;
          } catch {
            failedCount++;
          }
        }

        // Brief pause between engines to respect rate limits
        if (validEngines.length > 1) {
          await step.sleep(`rate-limit-${keyword.id}-${engineType}`, '500ms');
        }
      }
    }

    // Step 3: Update run status
    await step.run('update-run-status', async () => {
      const totalQueries =
        context.keywords.length * validEngines.length * context.runsPerKeyword;
      const status =
        failedCount === 0
          ? 'completed'
          : failedCount === totalQueries
            ? 'failed'
            : 'partial';

      await db
        .update(queryRuns)
        .set({
          status: status as 'completed' | 'failed' | 'partial',
          completedKeywords: completedCount,
          failedKeywords: failedCount,
          completedAt: new Date(),
        })
        .where(eq(queryRuns.id, queryRunId));
    });

    // Step 4: Trigger citation processing pipeline
    await step.sendEvent('trigger-processing', {
      name: 'monitoring/results.ready',
      data: { projectId, queryRunId },
    });

    return {
      queryRunId,
      completed: completedCount,
      failed: failedCount,
    };
  },
);
