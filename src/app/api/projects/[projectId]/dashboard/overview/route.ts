import { NextRequest } from 'next/server';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  citations,
  queryResults,
  competitorCitations,
  ga4TrafficData,
  alertEvents,
  alerts,
  trackedKeywords,
} from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';
import {
  calculateVisibilityScore,
  calculateShareOfVoice,
  calculateTrend,
  type EngineVisibilityInput,
} from '@/lib/citations/scoring';
import { daysAgo, dateToString } from '@/lib/utils';
import type { DashboardOverview, EngineType, AlertEventResponse } from '@/types';

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

    // Calculate period duration for previous period comparison
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);
    const prevTo = new Date(from.getTime());
    const prevFromStr = dateToString(prevFrom);
    const prevToStr = dateToString(prevTo);

    // 1. Current period visibility score
    const currentEngineData = await getVisibilityDataForPeriod(
      db, projectId, fromDate, toDate
    );
    const currentVisibility = calculateVisibilityScore(currentEngineData);

    // 2. Previous period visibility score for trend
    const prevEngineData = await getVisibilityDataForPeriod(
      db, projectId, prevFromStr, prevToStr
    );
    const prevVisibility = calculateVisibilityScore(prevEngineData);
    const visibilityTrend = calculateTrend(currentVisibility.score, prevVisibility.score);

    // 3. Total brand citations (current period)
    const [citationCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, new Date(fromDate)),
          lte(citations.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      );

    const [prevCitationCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, prevFrom),
          lte(citations.createdAt, from)
        )
      );

    const citationsTrend = calculateTrend(
      citationCount?.count || 0,
      prevCitationCount?.count || 0
    );

    // 4. AI referral sessions (current period)
    const [sessionsResult] = await db
      .select({
        totalSessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
      })
      .from(ga4TrafficData)
      .where(
        and(
          eq(ga4TrafficData.projectId, projectId),
          gte(ga4TrafficData.date, fromDate),
          lte(ga4TrafficData.date, toDate)
        )
      );

    const [prevSessionsResult] = await db
      .select({
        totalSessions: sql<number>`coalesce(sum(${ga4TrafficData.sessions}), 0)::int`,
      })
      .from(ga4TrafficData)
      .where(
        and(
          eq(ga4TrafficData.projectId, projectId),
          gte(ga4TrafficData.date, prevFromStr),
          lte(ga4TrafficData.date, prevToStr)
        )
      );

    const sessionsTrend = calculateTrend(
      sessionsResult?.totalSessions || 0,
      prevSessionsResult?.totalSessions || 0
    );

    // 5. Share of voice
    const [brandCitCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, new Date(fromDate)),
          lte(citations.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      );

    const compCitCounts = await db
      .select({
        competitorId: competitorCitations.competitorId,
        count: sql<number>`count(*)::int`,
      })
      .from(competitorCitations)
      .where(
        and(
          eq(competitorCitations.projectId, projectId),
          gte(competitorCitations.createdAt, new Date(fromDate)),
          lte(competitorCitations.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      )
      .groupBy(competitorCitations.competitorId);

    const currentSov = calculateShareOfVoice(
      brandCitCount?.count || 0,
      compCitCounts.map((c) => ({ competitorId: c.competitorId, count: c.count }))
    );

    // Previous period SoV
    const [prevBrandCitCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, prevFrom),
          lte(citations.createdAt, from)
        )
      );

    const prevCompCitCounts = await db
      .select({
        competitorId: competitorCitations.competitorId,
        count: sql<number>`count(*)::int`,
      })
      .from(competitorCitations)
      .where(
        and(
          eq(competitorCitations.projectId, projectId),
          gte(competitorCitations.createdAt, prevFrom),
          lte(competitorCitations.createdAt, from)
        )
      )
      .groupBy(competitorCitations.competitorId);

    const prevSov = calculateShareOfVoice(
      prevBrandCitCount?.count || 0,
      prevCompCitCounts.map((c) => ({ competitorId: c.competitorId, count: c.count }))
    );

    const shareOfVoiceTrend = calculateTrend(currentSov.shareOfVoice, prevSov.shareOfVoice);

    // 6. Visibility by engine
    const visibilityByEngine = currentEngineData.map((d) => ({
      engine: d.engine,
      score: d.totalKeywords > 0 ? (d.keywordsCited / d.totalKeywords) * 100 : 0,
    }));

    // 7. Visibility over time
    const dailyCitations = await db
      .select({
        date: sql<string>`date(${citations.createdAt})`,
        keywordsCited: sql<number>`count(distinct ${citations.keywordId})::int`,
      })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, new Date(fromDate)),
          lte(citations.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      )
      .groupBy(sql`date(${citations.createdAt})`);

    const [totalKeywordCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, projectId));

    const totalKw = totalKeywordCount?.count || 1;
    const visibilityOverTime = dailyCitations.map((d) => ({
      date: d.date,
      score: (d.keywordsCited / totalKw) * 100,
    }));

    // 8. Top cited pages
    const topPages = await db
      .select({
        url: citations.citedUrl,
        citationCount: sql<number>`count(*)::int`,
        engines: sql<string[]>`array_agg(distinct ${citations.engineType})`,
      })
      .from(citations)
      .where(
        and(
          eq(citations.projectId, projectId),
          eq(citations.isBrandCitation, true),
          gte(citations.createdAt, new Date(fromDate)),
          lte(citations.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      )
      .groupBy(citations.citedUrl)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const topCitedPages = topPages.map((p) => ({
      url: p.url,
      citations: p.citationCount,
      engines: (p.engines || []) as EngineType[],
    }));

    // 9. Recent alerts
    const recentAlertEvents = await db
      .select({
        id: alertEvents.id,
        alertType: alerts.alertType,
        title: alertEvents.title,
        description: alertEvents.description,
        isRead: alertEvents.isRead,
        createdAt: alertEvents.createdAt,
      })
      .from(alertEvents)
      .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
      .where(eq(alertEvents.projectId, projectId))
      .orderBy(desc(alertEvents.createdAt))
      .limit(5);

    const recentAlerts: AlertEventResponse[] = recentAlertEvents.map((e) => ({
      id: e.id,
      alertType: e.alertType as AlertEventResponse['alertType'],
      title: e.title,
      description: e.description,
      isRead: e.isRead,
      createdAt: e.createdAt.toISOString(),
    }));

    const overview: DashboardOverview = {
      visibilityScore: currentVisibility.score,
      visibilityTrend,
      totalCitations: citationCount?.count || 0,
      citationsTrend,
      aiReferralSessions: sessionsResult?.totalSessions || 0,
      sessionsTrend,
      shareOfVoice: currentSov.shareOfVoice,
      shareOfVoiceTrend,
      visibilityByEngine,
      visibilityOverTime,
      topCitedPages,
      recentAlerts,
    };

    return Response.json(overview);
  } catch (error) {
    return handleAuthError(error);
  }
}

async function getVisibilityDataForPeriod(
  db: ReturnType<typeof getDb>,
  projectId: string,
  fromDate: string,
  toDate: string
): Promise<EngineVisibilityInput[]> {
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
        gte(citations.createdAt, new Date(fromDate)),
        lte(citations.createdAt, new Date(toDate + 'T23:59:59Z'))
      )
    )
    .groupBy(citations.engineType);

  const totalKeywords = await db
    .select({
      engineType: queryResults.engineType,
      keywordCount: sql<number>`count(distinct ${queryResults.keywordId})::int`,
    })
    .from(queryResults)
    .where(
      and(
        eq(queryResults.projectId, projectId),
        gte(queryResults.createdAt, new Date(fromDate)),
        lte(queryResults.createdAt, new Date(toDate + 'T23:59:59Z'))
      )
    )
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
