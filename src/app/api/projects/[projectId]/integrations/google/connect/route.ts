import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess, AuthError } from '@/lib/auth/helpers';
import { exchangeAndStoreTokens, getAuthUrl } from '@/lib/analytics/google-auth';
import { canUseGA4 } from '@/lib/billing/plan-limits';

const connectBodySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
});

/**
 * POST /api/projects/[projectId]/integrations/google/connect
 * Exchange a Google OAuth authorization code for tokens and store them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { organization } = await requireProjectAccess(params.projectId);

    // Free tier cannot connect Google integrations
    if (!canUseGA4(organization.subscriptionTier)) {
      return NextResponse.json(
        { error: 'Upgrade required to connect Google integrations' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = connectBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await exchangeAndStoreTokens({
      code: parsed.data.code,
      projectId: params.projectId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error('Google connect error:', error);
    return NextResponse.json(
      { error: 'Failed to connect Google account' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/projects/[projectId]/integrations/google/connect
 * Redirect the user to Google's OAuth consent screen.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const { organization } = await requireProjectAccess(params.projectId);

    if (!canUseGA4(organization.subscriptionTier)) {
      return NextResponse.json(
        { error: 'Upgrade required to connect Google integrations' },
        { status: 403 },
      );
    }

    const authUrl = getAuthUrl(params.projectId);
    return NextResponse.json({ authUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 },
    );
  }
}
