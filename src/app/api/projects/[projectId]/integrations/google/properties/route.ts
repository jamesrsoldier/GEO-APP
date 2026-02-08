import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess, AuthError } from '@/lib/auth/helpers';
import { listGA4Properties } from '@/lib/analytics/ga4';
import { listGSCSites } from '@/lib/analytics/gsc';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/projects/[projectId]/integrations/google/properties
 * List available GA4 properties and GSC sites for the connected Google account.
 * Must be called after OAuth connect so the user can select which to monitor.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAccess(params.projectId);

    // Verify Google is connected
    const db = getDb();
    const [project] = await db
      .select({
        googleAccessToken: projects.googleAccessToken,
        googleRefreshToken: projects.googleRefreshToken,
      })
      .from(projects)
      .where(eq(projects.id, params.projectId))
      .limit(1);

    if (!project?.googleAccessToken || !project?.googleRefreshToken) {
      return NextResponse.json(
        { error: 'Google not connected. Please connect your Google account first.' },
        { status: 400 },
      );
    }

    // Fetch GA4 properties and GSC sites in parallel
    const [ga4Properties, gscSites] = await Promise.all([
      listGA4Properties(params.projectId).catch((err) => {
        console.error('Failed to list GA4 properties:', err);
        return [];
      }),
      listGSCSites(params.projectId).catch((err) => {
        console.error('Failed to list GSC sites:', err);
        return [];
      }),
    ]);

    return NextResponse.json({ ga4Properties, gscSites });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error('Google properties error:', error);
    return NextResponse.json(
      { error: 'Failed to list Google properties' },
      { status: 500 },
    );
  }
}
