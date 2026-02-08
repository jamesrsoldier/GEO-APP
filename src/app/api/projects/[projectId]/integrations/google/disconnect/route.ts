import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess, AuthError } from '@/lib/auth/helpers';
import { disconnectGoogle } from '@/lib/analytics/google-auth';

/**
 * POST /api/projects/[projectId]/integrations/google/disconnect
 * Remove all Google OAuth tokens and property IDs from the project.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAccess(params.projectId);
    await disconnectGoogle(params.projectId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error('Google disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google account' },
      { status: 500 },
    );
  }
}
