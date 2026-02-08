import { NextRequest, NextResponse } from 'next/server';
import { exchangeAndStoreTokens } from '@/lib/analytics/google-auth';

/**
 * GET /api/auth/google/callback
 * OAuth callback handler. Google redirects here after user consent.
 * Exchanges the authorization code for tokens and redirects to project settings.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // projectId
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=missing_params`,
    );
  }

  try {
    await exchangeAndStoreTokens({ code, projectId: state });

    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?success=google_connected`,
    );
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    return NextResponse.redirect(
      `${appUrl}/dashboard/settings/integrations?error=token_exchange_failed`,
    );
  }
}
