import { NextRequest } from 'next/server';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import {
  trackedKeywords,
  queryResults,
  citations,
} from '@/lib/db/schema';
import { requireProjectAccess, handleAuthError } from '@/lib/auth/helpers';
import { calculateCitationConfidence, calculateTrend } from '@/lib/citations/scoring';
import { daysAgo, dateToString } from '@/lib/utils';
import type { VisibilityByKeyword, EngineType } from '@/types';

const ENGINE_WEIGHTS: Record<EngineType, number> = {
  perplexity: 1.0,
  google_ai_overview: 1.5,
  chatgpt: 0.8,
  bing_copilot: 0.6,
  claude: 0.5,
};

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

    // Calculate previous period
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);

    // Get per-keyword, per-engine citation data for current period
    const currentData = await db
      .select({
        keywordId: trackedKeywords.id,
        keyword: trackedKeywords.keyword,
        category: trackedKeywords.category,
        engineType: queryResults.engineType,
        totalRuns: sql<number>`count(distinct ${queryResults.id})::int`,
        runsWithCitation: sql<number>`count(distinct case when ${citations.isBrandCitation} = true then ${queryResults.id} end)::int`,
      })
      .from(trackedKeywords)
      .innerJoin(
        queryResults,
        and(
          eq(queryResults.keywordId, trackedKeywords.id),
          eq(queryResults.projectId, projectId),
          gte(queryResults.createdAt, new Date(fromDate)),
          lte(queryResults.createdAt, new Date(toDate + 'T23:59:59Z'))
        )
      )
      .leftJoin(
        citations,
        and(
          eq(citations.queryResultId, queryResults.id),
          eq(citations.isBrandCitation, true)
        )
      )
      .where(eq(trackedKeywords.projectId, projectId))
      .groupBy(
        trackedKeywords.id,
        trackedKeywords.keyword,
        trackedKeywords.category,
        queryResults.engineType
      );

    // Get per-keyword, per-engine data for previous period
    const previousData = await db
      .select({
        keywordId: trackedKeywords.id,
        engineType: queryResults.engineType,
        totalRuns: sql<number>`count(distinct ${queryResults.id})::int`,
        runsWithCitation: sql<number>`count(distinct case when ${citations.isBrandCitation} = true then ${queryResults.id} end)::int`,
      })
      .from(trackedKeywords)
      .innerJoin(
        queryResults,
        and(
          eq(queryResults.keywordId, trackedKeywords.id),
          eq(queryResults.projectId, projectId),
          gte(queryResults.createdAt, prevFrom),
          lte(queryResults.createdAt, from)
        )
      )
      .leftJoin(
        citations,
        and(
          eq(citations.queryResultId, queryResults.id),
          eq(citations.isBrandCitation, true)
        )
      )
      .where(eq(trackedKeywords.projectId, projectId))
      .groupBy(
        trackedKeywords.id,
        queryResults.engineType
      );

    // Build a map: keywordId -> { engines, keyword, category }
    const keywordMap = new Map<
      string,
      {
        keyword: string;
        category: string | null;
        engines: Map<string, { totalRuns: number; runsWithCitation: number }>;
      }
    >();

    for (const row of currentData) {
      if (!keywordMap.has(row.keywordId)) {
        keywordMap.set(row.keywordId, {
          keyword: row.keyword,
          category: row.category,
          engines: new Map(),
        });
      }
      keywordMap.get(row.keywordId)!.engines.set(row.engineType, {
        totalRuns: row.totalRuns,
        runsWithCitation: row.runsWithCitation,
      });
    }

    // Build previous period map
    const prevMap = new Map<string, Map<string, { totalRuns: number; runsWithCitation: number }>>();
    for (const row of previousData) {
      if (!prevMap.has(row.keywordId)) {
        prevMap.set(row.keywordId, new Map());
      }
      prevMap.get(row.keywordId)!.set(row.engineType, {
        totalRuns: row.totalRuns,
        runsWithCitation: row.runsWithCitation,
      });
    }

    // Calculate per-keyword visibility
    const result: VisibilityByKeyword[] = [];

    for (const [keywordId, data] of Array.from(keywordMap)) {
      const byEngine: { engine: EngineType; score: number; cited: boolean }[] = [];
      let weightedSum = 0;
      let totalWeight = 0;
      let totalConfidence = 0;
      let engineCount = 0;

      for (const [engine, stats] of Array.from(data.engines)) {
        const engineType = engine as EngineType;
        const cited = stats.runsWithCitation > 0;
        const score = cited ? 100 : 0;
        const weight = ENGINE_WEIGHTS[engineType] || 1.0;

        weightedSum += score * weight;
        totalWeight += weight;

        const confidence = calculateCitationConfidence(
          stats.runsWithCitation,
          stats.totalRuns
        );
        totalConfidence += confidence;
        engineCount++;

        byEngine.push({ engine: engineType, score, cited });
      }

      const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      const avgConfidence = engineCount > 0 ? totalConfidence / engineCount : 0;

      // Calculate trend vs previous period
      const prevEngines = prevMap.get(keywordId);
      let prevWeightedSum = 0;
      let prevTotalWeight = 0;

      if (prevEngines) {
        for (const [engine, stats] of Array.from(prevEngines)) {
          const engineType = engine as EngineType;
          const score = stats.runsWithCitation > 0 ? 100 : 0;
          const weight = ENGINE_WEIGHTS[engineType] || 1.0;
          prevWeightedSum += score * weight;
          prevTotalWeight += weight;
        }
      }

      const prevScore = prevTotalWeight > 0 ? prevWeightedSum / prevTotalWeight : 0;
      const trend = calculateTrend(overallScore, prevScore);

      result.push({
        keywordId,
        keyword: data.keyword,
        category: data.category,
        overallScore,
        confidence: avgConfidence,
        byEngine,
        trend,
      });
    }

    // Also include keywords with no query results (score 0)
    const allKeywords = await db
      .select({
        id: trackedKeywords.id,
        keyword: trackedKeywords.keyword,
        category: trackedKeywords.category,
      })
      .from(trackedKeywords)
      .where(eq(trackedKeywords.projectId, projectId));

    for (const kw of allKeywords) {
      if (!keywordMap.has(kw.id)) {
        result.push({
          keywordId: kw.id,
          keyword: kw.keyword,
          category: kw.category,
          overallScore: 0,
          confidence: 0,
          byEngine: [],
          trend: 0,
        });
      }
    }

    return Response.json(result);
  } catch (error) {
    return handleAuthError(error);
  }
}
