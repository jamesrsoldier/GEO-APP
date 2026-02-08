import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import {
  queryRuns,
  trackedKeywords,
  organizations,
} from '@/lib/db/schema';
import { eq, and, gt, inArray, ne } from 'drizzle-orm';
import { requireProjectAccess, isAuthError } from '@/lib/auth/helpers';
import { canUseEngine, getPlanLimits } from '@/lib/billing/plan-limits';
import { inngest } from '@/lib/inngest/client';
import type { EngineType, SubscriptionTier, QueryRunResponse } from '@/types';

const triggerSchema = z.object({
  engineTypes: z.array(z.enum([
    'perplexity', 'google_ai_overview', 'chatgpt', 'bing_copilot', 'claude',
  ])).optional(),
  keywordIds: z.array(z.string().uuid()).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const authResult = await requireProjectAccess(request, projectId);
  if (isAuthError(authResult)) return authResult;

  const { project } = authResult;
  const db = getDb();

  // Parse and validate request body
  let body: z.infer<typeof triggerSchema>;
  try {
    const raw = await request.json();
    body = triggerSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  // Rate limiting: prevent more than 1 run per project per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recentRun] = await db
    .select({ id: queryRuns.id, status: queryRuns.status })
    .from(queryRuns)
    .where(
      and(
        eq(queryRuns.projectId, projectId),
        gt(queryRuns.createdAt, oneHourAgo),
        ne(queryRuns.status, 'failed'),
      ),
    )
    .limit(1);

  if (recentRun) {
    return NextResponse.json(
      { error: 'Monitoring already running or recently completed. Please wait before triggering again.' },
      { status: 429 },
    );
  }

  // Get org subscription tier
  const [org] = await db
    .select({ subscriptionTier: organizations.subscriptionTier })
    .from(organizations)
    .where(eq(organizations.id, project.organizationId))
    .limit(1);

  const tier = (org?.subscriptionTier || 'free') as SubscriptionTier;
  const limits = getPlanLimits(tier);

  // Determine engines to use
  const requestedEngines = body.engineTypes || limits.engines;
  const validEngines = requestedEngines.filter((e) => canUseEngine(tier, e as EngineType));

  if (validEngines.length === 0) {
    return NextResponse.json(
      { error: 'No valid engines available for your subscription tier' },
      { status: 403 },
    );
  }

  // Load and validate keywords
  let keywordQuery;
  if (body.keywordIds && body.keywordIds.length > 0) {
    keywordQuery = await db
      .select({ id: trackedKeywords.id })
      .from(trackedKeywords)
      .where(
        and(
          eq(trackedKeywords.projectId, projectId),
          inArray(trackedKeywords.id, body.keywordIds),
          eq(trackedKeywords.isActive, true),
        ),
      );
  } else {
    keywordQuery = await db
      .select({ id: trackedKeywords.id })
      .from(trackedKeywords)
      .where(
        and(
          eq(trackedKeywords.projectId, projectId),
          eq(trackedKeywords.isActive, true),
        ),
      );
  }

  if (keywordQuery.length === 0) {
    return NextResponse.json(
      { error: 'No active keywords found for this project' },
      { status: 400 },
    );
  }

  // Create queryRun
  const [queryRun] = await db
    .insert(queryRuns)
    .values({
      projectId,
      status: 'pending',
      engineTypes: validEngines as [EngineType, ...EngineType[]],
      totalKeywords: keywordQuery.length,
    })
    .returning();

  // Send Inngest event to trigger monitoring
  await inngest.send({
    name: 'monitoring/run.triggered',
    data: {
      projectId,
      queryRunId: queryRun.id,
      engineTypes: validEngines,
      keywordIds: keywordQuery.map((k) => k.id),
    },
  });

  const response: QueryRunResponse = {
    id: queryRun.id,
    status: queryRun.status as QueryRunResponse['status'],
    engineTypes: queryRun.engineTypes as EngineType[],
    totalKeywords: queryRun.totalKeywords,
    completedKeywords: queryRun.completedKeywords,
    failedKeywords: queryRun.failedKeywords,
    startedAt: queryRun.startedAt?.toISOString() || null,
    completedAt: queryRun.completedAt?.toISOString() || null,
  };

  return NextResponse.json(response, { status: 201 });
}
