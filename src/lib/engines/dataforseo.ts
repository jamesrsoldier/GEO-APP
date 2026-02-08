import { EngineAdapter, EngineResponse } from './types';

export class DataForSeoAdapter implements EngineAdapter {
  engineType = 'google_ai_overview' as const;

  async query(keyword: string): Promise<EngineResponse> {
    const start = Date.now();

    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
      throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD environment variables must be set');
    }

    const auth = Buffer.from(`${login}:${password}`).toString('base64');

    const response = await fetch(
      'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          keyword,
          location_code: 2840,       // United States
          language_code: 'en',
          device: 'desktop',
          os: 'windows',
        }]),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DataForSEO API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const result = data?.tasks?.[0]?.result?.[0];
    if (!result) {
      throw new Error('No result from DataForSEO');
    }

    // Find the AI Overview item
    const aiOverviewItem = result.items?.find(
      (item: Record<string, unknown>) => item.type === 'ai_overview',
    );

    if (!aiOverviewItem) {
      // No AI Overview for this keyword — still a valid result
      return {
        engineType: 'google_ai_overview',
        rawResponse: '',
        citationUrls: [],
        responseMetadata: {
          model: 'google_ai_overview',
          latencyMs: Date.now() - start,
          hasAiOverview: false,
        },
      };
    }

    // Extract AI Overview text
    const text = aiOverviewItem.text || aiOverviewItem.content || '';

    // Extract citation URLs from references array
    const citationUrls: string[] = (aiOverviewItem.references || [])
      .map((ref: Record<string, unknown>) => ref.url as string)
      .filter(Boolean);

    return {
      engineType: 'google_ai_overview',
      rawResponse: text,
      citationUrls,
      responseMetadata: {
        model: 'google_ai_overview',
        latencyMs: Date.now() - start,
        hasAiOverview: true,
      },
    };
  }
}
