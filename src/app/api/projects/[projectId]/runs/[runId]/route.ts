import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryRuns, queryResults, trackedKeywords } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireProjectAccess, isAuthError } from '@/lib/auth/helpers';
import type { EngineType, QueryRunResponse } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; runId: string }> },
) {
  const { projectId, runId } = await params;
  const authResult = await requireProjectAccess(request, projectId);
  if (isAuthError(authResult)) return authResult;

  const db = getDb();

  // Get the run
  const [run] = await db
    .select()
    .from(queryRuns)
    .where(
      and(
        eq(queryRuns.id, runId),
        eq(queryRuns.projectId, projectId),
      ),
    )
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // Get summarized results per keyword × engine
  const results = await db
    .select({
      keywordId: queryResults.keywordId,
      keyword: trackedKeywords.keyword,
      engineType: queryResults.engineType,
      citationCount: sql<number>`coalesce(array_length(${queryResults.citationUrls}, 1), 0)::int`,
      processedAt: queryResults.processedAt,
    })
    .from(queryResults)
    .innerJoin(trackedKeywords, eq(queryResults.keywordId, trackedKeywords.id))
    .where(eq(queryResults.queryRunId, runId));

  const response: QueryRunResponse & {
    results: {
      keywordId: string;
      keyword: string;
      engineType: EngineType;
      citationCount: number;
      processed: boolean;
    }[];
  } = {
    id: run.id,
    status: run.status as QueryRunResponse['status'],
    engineTypes: run.engineTypes as EngineType[],
    totalKeywords: run.totalKeywords,
    completedKeywords: run.completedKeywords,
    failedKeywords: run.failedKeywords,
    startedAt: run.startedAt?.toISOString() || null,
    completedAt: run.completedAt?.toISOString() || null,
    results: results.map((r) => ({
      keywordId: r.keywordId,
      keyword: r.keyword,
      engineType: r.engineType as EngineType,
      citationCount: r.citationCount,
      processed: r.processedAt !== null,
    })),
  };

  return NextResponse.json(response);
}
