import { NextRequest } from 'next/server';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ga4TrafficData, projects } from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';
import { daysAgo, dateToString } from '@/lib/utils';
import type { TrafficOverview } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    await requireProjectAccess(projectId);

    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from') || dateToString(daysAgo(7));
    const toDate = searchParams.get('to') || dateToString(new Date());

    const db = getDb();

    // Check if GA4 is connected
    const [project] = await db
      .select({ ga4PropertyId: projects.ga4PropertyId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project?.ga4PropertyId) {
      const emptyOverview: TrafficOverview = {
        totalAiSessions: 0,
        totalAiUsers: 0,
        totalAiConversions: 0,
        avgEngagementTime: 0,
        engagementRate: 0,
        bySource: [],
        overTime: [],
        topLandingPages: [],
      };
      return Response.json(emptyOverview);
    }

    const dateFilter = and(
      eq(ga4TrafficData.projectId, projectId),
      gte(ga4TrafficData.date, fromDate),
      lte(ga4TrafficData.date, toDate)
    );

    // 1. Totals
    const [totals] = await db
      .select({
        totalSessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
        totalUsers: sql<number>`coalesce(sum(${ga4TrafficData.users}), 0)::int`,
        totalConversions: sql<number>`coalesce(sum(${ga4TrafficData.conversions}), 0)::int`,
        totalEngagedSessions: sql<number>`coalesce(sum(${ga4TrafficData.engagedSessions}), 0)::int`,
        weightedEngagementTime: sql<number>`coalesce(sum(${ga4TrafficData.avgEngagementTime} * ${ga4TrafficData.sessions}), 0)`,
      })
      .from(ga4TrafficData)
      .where(dateFilter);

    const totalSessions = totals?.totalSessions || 0;
    const avgEngagementTime =
      totalSessions > 0
        ? (totals?.weightedEngagementTime || 0) / totalSessions
        : 0;
    const engagementRate =
      totalSessions > 0
        ? ((totals?.totalEngagedSessions || 0) / totalSessions)
        : 0;

    // 2. By source
    const bySource = await db
      .select({
        source: ga4TrafficData.source,
        sessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
        conversions: sql<number>`coalesce(sum(${ga4TrafficData.conversions}), 0)::int`,
      })
      .from(ga4TrafficData)
      .where(dateFilter)
      .groupBy(ga4TrafficData.source)
      .orderBy(desc(sql`sum(${ga4TrafficData.sessions})`));

    // 3. Over time
    const overTime = await db
      .select({
        date: ga4TrafficData.date,
        sessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
      })
      .from(ga4TrafficData)
      .where(dateFilter)
      .groupBy(ga4TrafficData.date)
      .orderBy(ga4TrafficData.date);

    // 4. Top landing pages
    const topLandingPages = await db
      .select({
        page: ga4TrafficData.landingPage,
        sessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
        engagedSessions: sql<number>`coalesce(sum(${ga4TrafficData.engagedSessions}), 0)::int`,
        totalPageSessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
      })
      .from(ga4TrafficData)
      .where(and(dateFilter, sql`${ga4TrafficData.landingPage} is not null`))
      .groupBy(ga4TrafficData.landingPage)
      .orderBy(desc(sql`sum(${ga4TrafficData.sessions})`))
      .limit(10);

    const overview: TrafficOverview = {
      totalAiSessions: totalSessions,
      totalAiUsers: totals?.totalUsers || 0,
      totalAiConversions: totals?.totalConversions || 0,
      avgEngagementTime,
      engagementRate,
      bySource: bySource.map((s) => ({
        source: s.source,
        sessions: s.sessions,
        conversions: s.conversions,
      })),
      overTime: overTime.map((d) => ({
        date: d.date,
        sessions: d.sessions,
      })),
      topLandingPages: topLandingPages.map((p) => ({
        page: p.page || '',
        sessions: p.sessions,
        engagementRate:
          p.totalPageSessions > 0
            ? p.engagedSessions / p.totalPageSessions
            : 0,
      })),
    };

    return Response.json(overview);
  } catch (error) {
    return handleAuthError(error);
  }
}
