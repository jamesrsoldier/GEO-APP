import { google } from 'googleapis';
import { getAuthenticatedClient } from './google-auth';
import { dateToString, daysAgo } from '@/lib/utils';

export interface GSCRow {
  date: string;
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

const ROW_LIMIT = 10000;

/**
 * Fetch search analytics data from Google Search Console.
 * Automatically paginates if there are more than 10,000 rows.
 */
export async function fetchGSCData(params: {
  projectId: string;
  siteUrl: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<GSCRow[]> {
  const auth = await getAuthenticatedClient(params.projectId);
  const searchConsole = google.searchconsole({ version: 'v1', auth });

  const startDate = params.startDate || daysAgo(5);
  const endDate = params.endDate || daysAgo(2);

  const allRows: GSCRow[] = [];
  let startRow = 0;

  while (true) {
    const response = await searchConsole.searchanalytics.query({
      siteUrl: params.siteUrl,
      requestBody: {
        startDate: dateToString(startDate),
        endDate: dateToString(endDate),
        dimensions: ['query', 'page', 'date'],
        rowLimit: ROW_LIMIT,
        startRow,
      },
    });

    const rows = response.data.rows;
    if (!rows || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const keys = row.keys || [];
      allRows.push({
        query: keys[0] || '',
        page: keys[1] || '',
        date: keys[2] || '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      });
    }

    // If fewer rows returned than the limit, we've fetched everything
    if (rows.length < ROW_LIMIT) {
      break;
    }

    startRow += ROW_LIMIT;
  }

  return allRows;
}

/**
 * List available sites in Google Search Console.
 * Only returns sites where the user has owner or full-user permissions.
 */
export async function listGSCSites(
  projectId: string,
): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const auth = await getAuthenticatedClient(projectId);
  const searchConsole = google.searchconsole({ version: 'v1', auth });

  const response = await searchConsole.sites.list();
  const entries = response.data.siteEntry || [];

  return entries
    .filter(
      (site) =>
        site.permissionLevel === 'siteOwner' ||
        site.permissionLevel === 'siteFullUser',
    )
    .map((site) => ({
      siteUrl: site.siteUrl || '',
      permissionLevel: site.permissionLevel || '',
    }));
}
