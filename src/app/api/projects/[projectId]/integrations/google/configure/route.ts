import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, AuthError } from '@/lib/auth/helpers';
import { canUseGA4, canUseGSC } from '@/lib/billing/plan-limits';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const configureBodySchema = z.object({
  ga4PropertyId: z
    .string()
    .regex(/^properties\/\d+$/, 'GA4 property ID must match format "properties/123456"')
    .optional(),
  gscSiteUrl: z
    .string()
    .url('GSC site URL must be a valid URL')
    .optional(),
});

/**
 * POST /api/projects/[projectId]/integrations/google/configure
 * Set the GA4 property and/or GSC site URL for the project.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { organization } = await requireProjectAccess(params.projectId);

    const body = await request.json();
    const parsed = configureBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ga4PropertyId, gscSiteUrl } = parsed.data;

    // Plan limit checks
    if (ga4PropertyId && !canUseGA4(organization.subscriptionTier)) {
      return NextResponse.json(
        { error: 'Upgrade to Starter or Growth plan to use GA4 integration' },
        { status: 403 },
      );
    }

    if (gscSiteUrl && !canUseGSC(organization.subscriptionTier)) {
      return NextResponse.json(
        { error: 'Upgrade to Growth plan to use Search Console integration' },
        { status: 403 },
      );
    }

    if (!ga4PropertyId && !gscSiteUrl) {
      return NextResponse.json(
        { error: 'At least one of ga4PropertyId or gscSiteUrl must be provided' },
        { status: 400 },
      );
    }

    // Build update payload only with provided fields
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (ga4PropertyId !== undefined) {
      updateData.ga4PropertyId = ga4PropertyId;
    }
    if (gscSiteUrl !== undefined) {
      updateData.gscSiteUrl = gscSiteUrl;
    }

    const db = getDb();
    await db
      .update(projects)
      .set(updateData)
      .where(eq(projects.id, params.projectId));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error('Google configure error:', error);
    return NextResponse.json(
      { error: 'Failed to configure Google integration' },
      { status: 500 },
    );
  }
}
