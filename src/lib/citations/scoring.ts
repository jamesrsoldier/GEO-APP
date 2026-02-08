import type {
  EngineType,
  VisibilityCalculation,
  ShareOfVoiceCalculation,
  ProminenceScore,
} from '@/types';

const ENGINE_WEIGHTS: Record<EngineType, number> = {
  perplexity: 1.0,
  google_ai_overview: 1.5,
  chatgpt: 0.8,
  bing_copilot: 0.6,
  claude: 0.5,
};

export interface EngineVisibilityInput {
  engine: EngineType;
  keywordsCited: number;
  totalKeywords: number;
}

export function calculateVisibilityScore(
  engineData: EngineVisibilityInput[]
): VisibilityCalculation {
  if (engineData.length === 0) {
    return { score: 0, breakdown: [] };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  const breakdown = engineData.map(({ engine, keywordsCited, totalKeywords }) => {
    const rawScore = totalKeywords > 0
      ? (keywordsCited / totalKeywords) * 100
      : 0;
    const weight = ENGINE_WEIGHTS[engine];

    weightedSum += rawScore * weight;
    totalWeight += weight;

    return {
      engine,
      keywordsCited,
      totalKeywords,
      rawScore,
      weight,
    };
  });

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return { score, breakdown };
}

export function calculateShareOfVoice(
  brandCitations: number,
  competitorCitationCounts: { competitorId: string; count: number }[]
): ShareOfVoiceCalculation {
  const totalCompetitorCitations = competitorCitationCounts.reduce(
    (sum, c) => sum + c.count,
    0
  );
  const totalCitations = brandCitations + totalCompetitorCitations;

  return {
    brandCitations,
    competitorCitations: competitorCitationCounts,
    totalCitations,
    shareOfVoice: totalCitations > 0
      ? (brandCitations / totalCitations) * 100
      : 0,
  };
}

export function calculateProminenceScore(position: number | null): ProminenceScore {
  let score: number;

  if (position === null || position === undefined) {
    score = 0.5;
  } else if (position === 1) {
    score = 1.0;
  } else if (position === 2) {
    score = 0.8;
  } else if (position === 3) {
    score = 0.6;
  } else {
    score = 0.4;
  }

  return { position, score };
}

export function calculateCitationConfidence(
  runsWithCitation: number,
  totalRuns: number
): number {
  if (totalRuns === 0) return 0;
  return (runsWithCitation / totalRuns) * 100;
}

export function calculateTrend(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}
