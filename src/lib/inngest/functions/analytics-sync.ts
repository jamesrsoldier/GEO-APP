import { inngest } from '../client';
import { getDb } from '@/lib/db';
import { projects, organizations, ga4TrafficData, gscData } from '@/lib/db/schema';
import { eq, isNotNull, or, sql } from 'drizzle-orm';
import { fetchGA4AiTraffic } from '@/lib/analytics/ga4';
import { fetchGSCData } from '@/lib/analytics/gsc';
import { canUseGA4, canUseGSC } from '@/lib/billing/plan-limits';
import { daysAgo } from '@/lib/utils';
import type { SubscriptionTier } from '@/types';

/**
 * Daily analytics sync job.
 * Runs at 8 AM UTC daily. Syncs GA4 and GSC data for all eligible projects.
 */
export const analyticsSync = inngest.createFunction(
  {
    id: 'analytics-sync',
    concurrency: { limit: 10 },
    retries: 2,
  },
  { cron: '0 8 * * *' },
  async ({ step }) => {
    // Step 1: Load all projects with GA4 or GSC configured
    const eligibleProjects = await step.run('load-projects', async () => {
      const db = getDb();
      const results = await db
        .select({
          projectId: projects.id,
          ga4PropertyId: projects.ga4PropertyId,
          gscSiteUrl: projects.gscSiteUrl,
          subscriptionTier: organizations.subscriptionTier,
        })
        .from(projects)
        .innerJoin(
          organizations,
          eq(projects.organizationId, organizations.id),
        )
        .where(
          or(
            isNotNull(projects.ga4PropertyId),
            isNotNull(projects.gscSiteUrl),
          ),
        );

      // Filter to projects whose org tier allows the integration
      return results.filter((r) => {
        const tier = r.subscriptionTier as SubscriptionTier;
        const hasGA4 = r.ga4PropertyId && canUseGA4(tier);
        const hasGSC = r.gscSiteUrl && canUseGSC(tier);
        return hasGA4 || hasGSC;
      });
    });

    // Step 2: Sync GA4 data for eligible projects
    const ga4Projects = eligibleProjects.filter(
      (p) => p.ga4PropertyId && canUseGA4(p.subscriptionTier as SubscriptionTier),
    );

    for (const project of ga4Projects) {
      await step.run(`sync-ga4-${project.projectId}`, async () => {
        try {
          const rows = await fetchGA4AiTraffic({
            projectId: project.projectId,
            startDate: daysAgo(3),
            endDate: new Date(),
          });

          if (rows.length === 0) return { synced: 0 };

          const db = getDb();
          for (const row of rows) {
            await db
              .insert(ga4TrafficData)
              .values({
                projectId: project.projectId,
                date: row.date,
                source: row.source,
                medium: row.medium,
                landingPage: row.landingPage,
                sessions: row.sessions,
                users: row.users,
                engagedSessions: row.engagedSessions,
                conversions: row.conversions,
                avgEngagementTime: row.avgEngagementTime,
              })
              .onConflictDoUpdate({
                target: [
                  ga4TrafficData.projectId,
                  ga4TrafficData.date,
                  ga4TrafficData.source,
                  ga4TrafficData.medium,
                  ga4TrafficData.landingPage,
                ],
                set: {
                  sessions: sql`excluded.sessions`,
                  users: sql`excluded.users`,
                  engagedSessions: sql`excluded.engaged_sessions`,
                  conversions: sql`excluded.conversions`,
                  avgEngagementTime: sql`excluded.avg_engagement_time`,
                },
              });
          }

          return { synced: rows.length };
        } catch (error) {
          // Log and skip this project — don't fail the entire job
          console.error(
            `GA4 sync failed for project ${project.projectId}:`,
            error instanceof Error ? error.message : error,
          );
          return { synced: 0, error: true };
        }
      });
    }

    // Step 3: Sync GSC data for eligible projects
    const gscProjects = eligibleProjects.filter(
      (p) => p.gscSiteUrl && canUseGSC(p.subscriptionTier as SubscriptionTier),
    );

    for (const project of gscProjects) {
      await step.run(`sync-gsc-${project.projectId}`, async () => {
        try {
          const rows = await fetchGSCData({
            projectId: project.projectId,
            siteUrl: project.gscSiteUrl!,
            startDate: daysAgo(5),
            endDate: daysAgo(2),
          });

          if (rows.length === 0) return { synced: 0 };

          const db = getDb();
          for (const row of rows) {
            await db
              .insert(gscData)
              .values({
                projectId: project.projectId,
                date: row.date,
                query: row.query,
                page: row.page,
                clicks: row.clicks,
                impressions: row.impressions,
                ctr: row.ctr,
                position: row.position,
              })
              .onConflictDoUpdate({
                target: [
                  gscData.projectId,
                  gscData.date,
                  gscData.query,
                  gscData.page,
                ],
                set: {
                  clicks: sql`excluded.clicks`,
                  impressions: sql`excluded.impressions`,
                  ctr: sql`excluded.ctr`,
                  position: sql`excluded.position`,
                },
              });
          }

          return { synced: rows.length };
        } catch (error) {
          console.error(
            `GSC sync failed for project ${project.projectId}:`,
            error instanceof Error ? error.message : error,
          );
          return { synced: 0, error: true };
        }
      });
    }

    return {
      ga4ProjectsSynced: ga4Projects.length,
      gscProjectsSynced: gscProjects.length,
    };
  },
);
