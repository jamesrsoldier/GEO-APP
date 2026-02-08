import { EngineType } from '@/types';

// Every engine adapter must produce this standardized output
export interface EngineResponse {
  engineType: EngineType;
  rawResponse: string;          // Full text of the AI response
  citationUrls: string[];       // Extracted URLs from the response
  responseMetadata: {
    model: string;              // e.g., "sonar", "google_ai_overview"
    tokensUsed?: number;
    latencyMs: number;
    hasAiOverview?: boolean;    // DataForSEO: whether AI Overview was present
  };
}

// Common interface for all adapters
export interface EngineAdapter {
  engineType: EngineType;
  query(keyword: string): Promise<EngineResponse>;
}

// Query template function — transforms a bare keyword into a natural prompt
export function buildQueryPrompt(keyword: string): string {
  // If keyword is already a question, use as-is
  if (keyword.endsWith('?')) return keyword;

  // If keyword contains "best", "top", "how to", "what is" — use as-is
  const naturalPrefixes = [
    'best', 'top', 'how to', 'what is', 'what are',
    'why', 'when', 'where', 'which', 'compare',
  ];
  const lower = keyword.toLowerCase();
  if (naturalPrefixes.some((p) => lower.startsWith(p))) return keyword;

  // Otherwise, wrap in a natural question
  return `What are the best ${keyword}?`;
}
