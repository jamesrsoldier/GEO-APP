import { google } from 'googleapis';
import { getAuthenticatedClient } from './google-auth';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { dateToString, daysAgo } from '@/lib/utils';

/** Known AI referral source domains to filter GA4 traffic */
export const AI_REFERRAL_SOURCES = [
  'chatgpt.com',
  'perplexity.ai',
  'claude.ai',
  'you.com',
  'phind.com',
  'copilot.microsoft.com',
  'gemini.google.com',
];

export interface GA4TrafficRow {
  date: string;
  source: string;
  medium: string;
  landingPage: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  conversions: number;
  avgEngagementTime: number;
}

/**
 * Fetch AI referral traffic data from GA4 Data API.
 * Returns traffic rows filtered to known AI referral sources.
 */
export async function fetchGA4AiTraffic(params: {
  projectId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<GA4TrafficRow[]> {
  const db = getDb();
  const [project] = await db
    .select({ ga4PropertyId: projects.ga4PropertyId })
    .from(projects)
    .where(eq(projects.id, params.projectId))
    .limit(1);

  if (!project?.ga4PropertyId) {
    throw new Error('GA4 property not configured for this project');
  }

  const auth = await getAuthenticatedClient(params.projectId);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

  const startDate = params.startDate || daysAgo(3);
  const endDate = params.endDate || new Date();

  const response = await analyticsData.properties.runReport({
    property: project.ga4PropertyId,
    requestBody: {
      dateRanges: [
        {
          startDate: dateToString(startDate),
          endDate: dateToString(endDate),
        },
      ],
      dimensions: [
        { name: 'date' },
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'landingPage' },
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'engagedSessions' },
        { name: 'conversions' },
        { name: 'averageSessionDuration' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: {
            values: AI_REFERRAL_SOURCES,
          },
        },
      },
    },
  });

  const rows = response.data.rows;
  if (!rows || rows.length === 0) {
    return [];
  }

  return rows.map((row) => {
    const dims = row.dimensionValues || [];
    const metrics = row.metricValues || [];

    // GA4 date format is "YYYYMMDD" — convert to "YYYY-MM-DD"
    const rawDate = dims[0]?.value || '';
    const formattedDate = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate;

    return {
      date: formattedDate,
      source: dims[1]?.value || '',
      medium: dims[2]?.value || '',
      landingPage: dims[3]?.value || '',
      sessions: parseInt(metrics[0]?.value || '0', 10),
      users: parseInt(metrics[1]?.value || '0', 10),
      engagedSessions: parseInt(metrics[2]?.value || '0', 10),
      conversions: parseInt(metrics[3]?.value || '0', 10),
      avgEngagementTime: parseFloat(metrics[4]?.value || '0'),
    };
  });
}

/**
 * List available GA4 properties for the authenticated Google account.
 * Uses the Analytics Admin API account summaries endpoint.
 */
export async function listGA4Properties(
  projectId: string,
): Promise<{ id: string; displayName: string }[]> {
  const auth = await getAuthenticatedClient(projectId);
  const admin = google.analyticsadmin({ version: 'v1beta', auth });

  const properties: { id: string; displayName: string }[] = [];
  let pageToken: string | undefined;

  do {
    const response = await admin.accountSummaries.list({
      pageSize: 200,
      pageToken,
    });

    const summaries = response.data.accountSummaries || [];
    for (const account of summaries) {
      const propertySummaries = account.propertySummaries || [];
      for (const prop of propertySummaries) {
        if (prop.property && prop.displayName) {
          properties.push({
            id: prop.property, // format: "properties/123456789"
            displayName: prop.displayName,
          });
        }
      }
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return properties;
}
