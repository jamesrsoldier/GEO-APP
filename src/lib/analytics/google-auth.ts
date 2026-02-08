import { OAuth2Client } from 'google-auth-library';
import { encrypt, decrypt } from '@/lib/encryption';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

/**
 * Create an OAuth2 client configured with Google credentials.
 */
export function createOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
  );
}

/**
 * Generate authorization URL for user consent flow.
 * @param state - Encoded state (e.g., projectId) to pass through OAuth redirect
 */
export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange OAuth authorization code for tokens, encrypt, and store in the project.
 */
export async function exchangeAndStoreTokens(params: {
  code: string;
  projectId: string;
}): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(params.code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  const db = getDb();
  await db
    .update(projects)
    .set({
      googleAccessToken: encrypt(tokens.access_token),
      googleRefreshToken: encrypt(tokens.refresh_token),
      googleTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, params.projectId));
}

/**
 * Get an authenticated OAuth client for a project.
 * Automatically refreshes expired tokens and persists the new access token.
 */
export async function getAuthenticatedClient(
  projectId: string,
): Promise<OAuth2Client> {
  const db = getDb();
  const [project] = await db
    .select({
      googleAccessToken: projects.googleAccessToken,
      googleRefreshToken: projects.googleRefreshToken,
      googleTokenExpiry: projects.googleTokenExpiry,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project?.googleAccessToken || !project?.googleRefreshToken) {
    throw new Error('Google not connected for this project');
  }

  const client = createOAuthClient();
  const accessToken = decrypt(project.googleAccessToken);
  const refreshToken = decrypt(project.googleRefreshToken);

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: project.googleTokenExpiry?.getTime(),
  });

  // Refresh if token is expired or will expire within 5 minutes
  const now = Date.now();
  const expiry = project.googleTokenExpiry?.getTime() || 0;
  if (expiry - now < 5 * 60 * 1000) {
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token) {
      await db
        .update(projects)
        .set({
          googleAccessToken: encrypt(credentials.access_token),
          googleTokenExpiry: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      client.setCredentials(credentials);
    }
  }

  return client;
}

/**
 * Remove all Google OAuth tokens and property IDs from a project.
 */
export async function disconnectGoogle(projectId: string): Promise<void> {
  const db = getDb();
  await db
    .update(projects)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      ga4PropertyId: null,
      gscSiteUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));
}
