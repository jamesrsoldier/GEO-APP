import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { queryRuns } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireProjectAccess, isAuthError } from '@/lib/auth/helpers';
import type { EngineType, QueryRunResponse } from '@/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const authResult = await requireProjectAccess(request, projectId);
  if (isAuthError(authResult)) return authResult;

  const db = getDb();
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(queryRuns)
    .where(eq(queryRuns.projectId, projectId));

  // Get paginated runs
  const runs = await db
    .select()
    .from(queryRuns)
    .where(eq(queryRuns.projectId, projectId))
    .orderBy(desc(queryRuns.createdAt))
    .limit(limit)
    .offset(offset);

  const data: QueryRunResponse[] = runs.map((run) => ({
    id: run.id,
    status: run.status as QueryRunResponse['status'],
    engineTypes: run.engineTypes as EngineType[],
    totalKeywords: run.totalKeywords,
    completedKeywords: run.completedKeywords,
    failedKeywords: run.failedKeywords,
    startedAt: run.startedAt?.toISOString() || null,
    completedAt: run.completedAt?.toISOString() || null,
  }));

  return NextResponse.json({ data, total: count, limit, offset });
}
