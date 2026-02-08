import { eq, and, desc, sql } from 'drizzle-orm';
import { inngest } from '../client';
import { getDb } from '@/lib/db';
import {
  alerts,
  alertEvents,
  citations,
  brandMentions,
  competitorCitations,
  queryRuns,
  queryResults,
  trackedKeywords,
  projects,
  organizationMembers,
  users,
} from '@/lib/db/schema';
import {
  calculateVisibilityScore,
  calculateShareOfVoice,
  type EngineVisibilityInput,
} from '@/lib/citations/scoring';
import type { AlertType, EngineType } from '@/types';

export const alertEvaluator = inngest.createFunction(
  {
    id: 'alert-evaluator',
    concurrency: { limit: 10 },
    retries: 2,
  },
  { event: 'alerts/evaluate' },
  async ({ event, step }) => {
    const { projectId } = event.data as { projectId: string };
    const db = getDb();

    // Step 1: Load context
    const context = await step.run('load-context', async () => {
      const enabledAlerts = await db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.projectId, projectId),
            eq(alerts.isEnabled, true)
          )
        );

      if (enabledAlerts.length === 0) {
        return null;
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) return null;

      return { alerts: enabledAlerts, project };
    });

    if (!context) return { skipped: true, reason: 'No enabled alerts or project not found' };

    // Step 2: Calculate current metrics
    const metrics = await step.run('calculate-current-metrics', async () => {
      // Get the two most recent completed query runs
      const recentRuns = await db
        .select()
        .from(queryRuns)
        .where(
          and(
            eq(queryRuns.projectId, projectId),
            eq(queryRuns.status, 'completed')
          )
        )
        .orderBy(desc(queryRuns.completedAt))
        .limit(2);

      const currentRun = recentRuns[0] || null;
      const previousRun = recentRuns[1] || null;

      if (!currentRun) {
        return {
          currentVisibility: 0,
          previousVisibility: 0,
          newCitations: [] as { keyword: string; engine: string; url: string }[],
          lostCitations: [] as { keyword: string; engine: string }[],
          currentShareOfVoice: 0,
          previousShareOfVoice: 0,
          negativeMentions: [] as { keyword: string; engine: string; context: string }[],
        };
      }

      // Calculate current visibility score
      const currentEngineData = await getEngineVisibilityData(db, projectId, currentRun.id);
      const currentVisCalc = calculateVisibilityScore(currentEngineData);

      // Calculate previous visibility score
      let previousVisCalc = { score: 0 };
      if (previousRun) {
        const prevEngineData = await getEngineVisibilityData(db, projectId, previousRun.id);
        previousVisCalc = calculateVisibilityScore(prevEngineData);
      }

      // Find new citations (brand citations in current run not in previous)
      let newCitations: { keyword: string; engine: string; url: string }[] = [];
      let lostCitations: { keyword: string; engine: string }[] = [];

      if (previousRun) {
        const currentBrandCitations = await db
          .select({
            keywordId: citations.keywordId,
            engineType: citations.engineType,
            citedUrl: citations.citedUrl,
            keyword: trackedKeywords.keyword,
          })
          .from(citations)
          .innerJoin(trackedKeywords, eq(trackedKeywords.id, citations.keywordId))
          .innerJoin(queryResults, eq(queryResults.id, citations.queryResultId))
          .where(
            and(
              eq(citations.projectId, projectId),
              eq(citations.isBrandCitation, true),
              eq(queryResults.queryRunId, currentRun.id)
            )
          );

        const previousBrandCitations = await db
          .select({
            keywordId: citations.keywordId,
            engineType: citations.engineType,
            keyword: trackedKeywords.keyword,
          })
          .from(citations)
          .innerJoin(trackedKeywords, eq(trackedKeywords.id, citations.keywordId))
          .innerJoin(queryResults, eq(queryResults.id, citations.queryResultId))
          .where(
            and(
              eq(citations.projectId, projectId),
              eq(citations.isBrandCitation, true),
              eq(queryResults.queryRunId, previousRun.id)
            )
          );

        const prevKeySet = new Set(
          previousBrandCitations.map((c) => `${c.keywordId}:${c.engineType}`)
        );
        const currKeySet = new Set(
          currentBrandCitations.map((c) => `${c.keywordId}:${c.engineType}`)
        );

        newCitations = currentBrandCitations
          .filter((c) => !prevKeySet.has(`${c.keywordId}:${c.engineType}`))
          .map((c) => ({
            keyword: c.keyword,
            engine: c.engineType,
            url: c.citedUrl,
          }));

        lostCitations = previousBrandCitations
          .filter((c) => !currKeySet.has(`${c.keywordId}:${c.engineType}`))
          .map((c) => ({
            keyword: c.keyword,
            engine: c.engineType,
          }));
      }

      // Share of voice - current
      const currentBrandCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(citations)
        .innerJoin(queryResults, eq(queryResults.id, citations.queryResultId))
        .where(
          and(
            eq(citations.projectId, projectId),
            eq(citations.isBrandCitation, true),
            eq(queryResults.queryRunId, currentRun.id)
          )
        );

      const currentCompCounts = await db
        .select({
          competitorId: competitorCitations.competitorId,
          count: sql<number>`count(*)::int`,
        })
        .from(competitorCitations)
        .innerJoin(queryResults, eq(queryResults.id, competitorCitations.queryResultId))
        .where(
          and(
            eq(competitorCitations.projectId, projectId),
            eq(queryResults.queryRunId, currentRun.id)
          )
        )
        .groupBy(competitorCitations.competitorId);

      const currentSov = calculateShareOfVoice(
        currentBrandCount[0]?.count || 0,
        currentCompCounts.map((c) => ({ competitorId: c.competitorId, count: c.count }))
      );

      // Share of voice - previous
      let previousSov = { shareOfVoice: 0 };
      if (previousRun) {
        const prevBrandCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(citations)
          .innerJoin(queryResults, eq(queryResults.id, citations.queryResultId))
          .where(
            and(
              eq(citations.projectId, projectId),
              eq(citations.isBrandCitation, true),
              eq(queryResults.queryRunId, previousRun.id)
            )
          );

        const prevCompCounts = await db
          .select({
            competitorId: competitorCitations.competitorId,
            count: sql<number>`count(*)::int`,
          })
          .from(competitorCitations)
          .innerJoin(queryResults, eq(queryResults.id, competitorCitations.queryResultId))
          .where(
            and(
              eq(competitorCitations.projectId, projectId),
              eq(queryResults.queryRunId, previousRun.id)
            )
          )
          .groupBy(competitorCitations.competitorId);

        previousSov = calculateShareOfVoice(
          prevBrandCount[0]?.count || 0,
          prevCompCounts.map((c) => ({ competitorId: c.competitorId, count: c.count }))
        );
      }

      // Negative sentiment mentions from current run
      const negativeMentionsResult = await db
        .select({
          keyword: trackedKeywords.keyword,
          engineType: brandMentions.engineType,
          context: brandMentions.context,
        })
        .from(brandMentions)
        .innerJoin(trackedKeywords, eq(trackedKeywords.id, brandMentions.keywordId))
        .innerJoin(queryResults, eq(queryResults.id, brandMentions.queryResultId))
        .where(
          and(
            eq(brandMentions.projectId, projectId),
            eq(brandMentions.sentiment, 'negative'),
            eq(queryResults.queryRunId, currentRun.id)
          )
        );

      return {
        currentVisibility: currentVisCalc.score,
        previousVisibility: previousVisCalc.score,
        newCitations,
        lostCitations,
        currentShareOfVoice: currentSov.shareOfVoice,
        previousShareOfVoice: previousSov.shareOfVoice,
        negativeMentions: negativeMentionsResult.map((m) => ({
          keyword: m.keyword,
          engine: m.engineType,
          context: m.context || '',
        })),
      };
    });

    // Step 3: Evaluate and create events
    const createdEvents = await step.run('evaluate-and-create-events', async () => {
      const events: {
        alertId: string;
        alertType: AlertType;
        title: string;
        description: string;
        metadata: Record<string, unknown>;
        channel: string;
      }[] = [];

      for (const alert of context.alerts) {
        const threshold = alert.threshold ?? 0.2;

        switch (alert.alertType) {
          case 'visibility_drop': {
            if (metrics.previousVisibility > 0) {
              const dropPercent =
                (metrics.previousVisibility - metrics.currentVisibility) /
                metrics.previousVisibility;
              if (dropPercent >= threshold) {
                const changePercent = (dropPercent * 100).toFixed(1);
                events.push({
                  alertId: alert.id,
                  alertType: 'visibility_drop',
                  title: 'Visibility Score Dropped',
                  description: `Your AI visibility score dropped from ${metrics.previousVisibility.toFixed(1)}% to ${metrics.currentVisibility.toFixed(1)}% (a ${changePercent}% decrease)`,
                  metadata: {
                    previousScore: metrics.previousVisibility,
                    currentScore: metrics.currentVisibility,
                    changePercent: Number(changePercent),
                  },
                  channel: alert.channel,
                });
              }
            }
            break;
          }

          case 'visibility_increase': {
            if (metrics.previousVisibility > 0) {
              const increasePercent =
                (metrics.currentVisibility - metrics.previousVisibility) /
                metrics.previousVisibility;
              if (increasePercent >= threshold) {
                const changePercent = (increasePercent * 100).toFixed(1);
                events.push({
                  alertId: alert.id,
                  alertType: 'visibility_increase',
                  title: 'Visibility Score Increased',
                  description: `Your AI visibility score increased from ${metrics.previousVisibility.toFixed(1)}% to ${metrics.currentVisibility.toFixed(1)}% (a ${changePercent}% increase)`,
                  metadata: {
                    previousScore: metrics.previousVisibility,
                    currentScore: metrics.currentVisibility,
                    changePercent: Number(changePercent),
                  },
                  channel: alert.channel,
                });
              }
            }
            break;
          }

          case 'new_citation': {
            if (metrics.newCitations.length > 0) {
              const citationSummary = metrics.newCitations
                .slice(0, 3)
                .map((c) => `${c.keyword} on ${c.engine}`)
                .join(', ');
              const suffix = metrics.newCitations.length > 3
                ? `, and ${metrics.newCitations.length - 3} more`
                : '';
              events.push({
                alertId: alert.id,
                alertType: 'new_citation',
                title: 'New AI Citations Detected',
                description: `${metrics.newCitations.length} new citation(s) found: ${citationSummary}${suffix}`,
                metadata: { citations: metrics.newCitations },
                channel: alert.channel,
              });
            }
            break;
          }

          case 'lost_citation': {
            if (metrics.lostCitations.length > 0) {
              const lostSummary = metrics.lostCitations
                .slice(0, 3)
                .map((c) => `${c.keyword} on ${c.engine}`)
                .join(', ');
              const suffix = metrics.lostCitations.length > 3
                ? `, and ${metrics.lostCitations.length - 3} more`
                : '';
              events.push({
                alertId: alert.id,
                alertType: 'lost_citation',
                title: 'AI Citations Lost',
                description: `${metrics.lostCitations.length} citation(s) no longer appearing: ${lostSummary}${suffix}`,
                metadata: { citations: metrics.lostCitations },
                channel: alert.channel,
              });
            }
            break;
          }

          case 'competitor_change': {
            const sovChange = Math.abs(
              metrics.currentShareOfVoice - metrics.previousShareOfVoice
            );
            if (sovChange >= threshold * 100) {
              events.push({
                alertId: alert.id,
                alertType: 'competitor_change',
                title: 'Competitor Share of Voice Changed',
                description: `Your share of voice changed from ${metrics.previousShareOfVoice.toFixed(1)}% to ${metrics.currentShareOfVoice.toFixed(1)}%`,
                metadata: {
                  previousShare: metrics.previousShareOfVoice,
                  currentShare: metrics.currentShareOfVoice,
                },
                channel: alert.channel,
              });
            }
            break;
          }

          case 'negative_sentiment': {
            if (metrics.negativeMentions.length > 0) {
              const first = metrics.negativeMentions[0];
              const contextSnippet = first.context.length > 100
                ? first.context.substring(0, 100) + '...'
                : first.context;
              events.push({
                alertId: alert.id,
                alertType: 'negative_sentiment',
                title: 'Negative Brand Mention Detected',
                description: `Negative sentiment found for '${first.keyword}' on ${first.engine}: '${contextSnippet}'`,
                metadata: { mentions: metrics.negativeMentions },
                channel: alert.channel,
              });
            }
            break;
          }
        }
      }

      // Insert alert events
      if (events.length > 0) {
        await db.insert(alertEvents).values(
          events.map((e) => ({
            alertId: e.alertId,
            projectId,
            title: e.title,
            description: e.description,
            metadata: e.metadata,
          }))
        );
      }

      return events;
    });

    // Step 4: Send email notifications (stub for MVP)
    if (createdEvents.length > 0) {
      await step.run('send-notifications', async () => {
        const emailAlerts = createdEvents.filter((e) => e.channel === 'email');
        if (emailAlerts.length === 0) return { sent: 0 };

        // Load organization members' emails for notification
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (!project) return { sent: 0 };

        const members = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(organizationMembers)
          .innerJoin(users, eq(users.id, organizationMembers.userId))
          .where(eq(organizationMembers.organizationId, project.organizationId));

        // Stub: In production, use Resend to send emails
        // For MVP, just log the notification
        for (const alert of emailAlerts) {
          console.log(
            `[Alert Email Stub] Would send to ${members.map((m) => m.email).join(', ')}: ${alert.title} — ${alert.description}`
          );
        }

        return { sent: emailAlerts.length, recipients: members.length };
      });
    }

    return {
      projectId,
      alertsEvaluated: context.alerts.length,
      eventsCreated: createdEvents.length,
    };
  }
);

// Helper function to get per-engine visibility data for a specific query run
async function getEngineVisibilityData(
  db: ReturnType<typeof getDb>,
  projectId: string,
  queryRunId: string
): Promise<EngineVisibilityInput[]> {
  // Get distinct keywords with brand citations per engine
  const citedKeywords = await db
    .select({
      engineType: citations.engineType,
      keywordCount: sql<number>`count(distinct ${citations.keywordId})::int`,
    })
    .from(citations)
    .innerJoin(queryResults, eq(queryResults.id, citations.queryResultId))
    .where(
      and(
        eq(citations.projectId, projectId),
        eq(citations.isBrandCitation, true),
        eq(queryResults.queryRunId, queryRunId)
      )
    )
    .groupBy(citations.engineType);

  // Get total distinct keywords queried per engine
  const totalKeywords = await db
    .select({
      engineType: queryResults.engineType,
      keywordCount: sql<number>`count(distinct ${queryResults.keywordId})::int`,
    })
    .from(queryResults)
    .where(eq(queryResults.queryRunId, queryRunId))
    .groupBy(queryResults.engineType);

  const citedMap = new Map(
    citedKeywords.map((c) => [c.engineType, c.keywordCount])
  );

  return totalKeywords.map((t) => ({
    engine: t.engineType as EngineType,
    keywordsCited: citedMap.get(t.engineType) || 0,
    totalKeywords: t.keywordCount,
  }));
}
