import type { EngineType } from '@/types';

// Engine importance weights for visibility score calculation
const ENGINE_WEIGHTS: Record<EngineType, number> = {
  perplexity: 1.0,
  google_ai_overview: 1.5,
  chatgpt: 0.8,
  bing_copilot: 0.6,
  claude: 0.5,
};

// ============================================
// AI VISIBILITY SCORE
// ============================================

export interface VisibilityInput {
  engine: EngineType;
  keywordsWithBrandCitation: number;
  totalKeywordsQueried: number;
}

/**
 * Calculates the overall AI Visibility Score across engines.
 *
 * Formula per engine:
 *   engine_score = (keywords_with_brand_citation / total_keywords_queried) * 100
 *   weighted_score = engine_score * ENGINE_WEIGHT
 *
 * Overall = sum(weighted_scores) / sum(weights_of_active_engines)
 */
export function calculateVisibilityScore(inputs: VisibilityInput[]): {
  overall: number;
  byEngine: { engine: EngineType; score: number; weight: number; weighted: number }[];
} {
  if (inputs.length === 0) return { overall: 0, byEngine: [] };

  let weightedSum = 0;
  let totalWeight = 0;
  const byEngine = inputs.map(input => {
    const rawScore = input.totalKeywordsQueried > 0
      ? (input.keywordsWithBrandCitation / input.totalKeywordsQueried) * 100
      : 0;
    const weight = ENGINE_WEIGHTS[input.engine] || 1.0;
    const weighted = rawScore * weight;
    weightedSum += weighted;
    totalWeight += weight;
    return { engine: input.engine, score: rawScore, weight, weighted };
  });

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { overall: Math.round(overall * 10) / 10, byEngine };
}

// ============================================
// CITATION CONFIDENCE
// ============================================

/**
 * Calculates citation confidence for a keyword+engine pair.
 *
 * confidence = (runsWithCitation / totalRuns) * 100
 *
 * Only meaningful when runsPerKeyword > 1 (starter/growth tiers).
 */
export function calculateCitationConfidence(params: {
  totalRuns: number;
  runsWithCitation: number;
}): number {
  if (params.totalRuns === 0) return 0;
  return Math.round((params.runsWithCitation / params.totalRuns) * 100 * 10) / 10;
}

// ============================================
// PROMINENCE SCORE
// ============================================

/**
 * Calculates a position-based prominence score for a citation.
 *
 * Position 1 = 1.0 (first citation, highest prominence)
 * Position 2 = 0.8
 * Position 3 = 0.6
 * Position 4+ = 0.4
 * No position data = 0.5 (default)
 */
export function calculateProminenceScore(position: number | null): number {
  if (position === null) return 0.5;
  if (position === 1) return 1.0;
  if (position === 2) return 0.8;
  if (position === 3) return 0.6;
  return 0.4; // position >= 4
}

// ============================================
// SHARE OF VOICE
// ============================================

/**
 * Calculates Share of Voice across brand and competitor citations.
 *
 * share_of_voice = (brand_citations / total_citations) * 100
 *
 * Returns 0 when no citations exist (not 100), since there's no voice to share.
 */
export function calculateShareOfVoice(params: {
  brandCitations: number;
  competitorCitations: { competitorId: string; count: number }[];
}): {
  brandShare: number;
  competitorShares: { competitorId: string; share: number }[];
  totalCitations: number;
} {
  const totalCompetitor = params.competitorCitations.reduce((sum, c) => sum + c.count, 0);
  const totalCitations = params.brandCitations + totalCompetitor;

  if (totalCitations === 0) {
    return { brandShare: 0, competitorShares: [], totalCitations: 0 };
  }

  const brandShare = Math.round((params.brandCitations / totalCitations) * 100 * 10) / 10;
  const competitorShares = params.competitorCitations.map(c => ({
    competitorId: c.competitorId,
    share: Math.round((c.count / totalCitations) * 100 * 10) / 10,
  }));

  return { brandShare, competitorShares, totalCitations };
}
