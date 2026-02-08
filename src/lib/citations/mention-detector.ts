import type { MentionType, SentimentType } from '@/types';

export interface DetectedMention {
  mentionType: MentionType;
  matchedText: string;            // the exact text that matched
  context: string;                // ±100 chars surrounding the match
  confidence: number;             // 0.0 to 1.0
  sentiment: SentimentType | null;
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/**
 * Detects brand mentions in AI response text using a multi-stage pipeline:
 *   1. Direct citation (if URL citation already matched)
 *   2. Exact brand name / alias matching (case-insensitive)
 *   3. Domain mention in text
 *   4. Fuzzy matching (Levenshtein distance ≤ 2 for names ≥ 5 chars)
 *
 * Returns 'not_found' if no mentions are detected.
 */
export function detectBrandMentions(params: {
  responseText: string;
  brandName: string;
  brandAliases: string[];
  projectDomain: string;
  hasCitationMatch: boolean;
}): DetectedMention[] {
  const mentions: DetectedMention[] = [];
  const text = params.responseText;

  if (!text || text.trim().length === 0) {
    return [{
      mentionType: 'not_found',
      matchedText: '',
      context: '',
      confidence: 1.0,
      sentiment: null,
    }];
  }

  // If we already found a URL citation for this brand, record it
  if (params.hasCitationMatch) {
    mentions.push({
      mentionType: 'direct_citation',
      matchedText: params.projectDomain,
      context: 'URL citation detected in structured citations',
      confidence: 1.0,
      sentiment: null,
    });
  }

  // Stage 1: Exact brand name matching (case-insensitive)
  const allNames = [params.brandName, ...params.brandAliases].filter(Boolean);
  for (const name of allNames) {
    const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 100);
      const context = text.slice(start, end);

      mentions.push({
        mentionType: 'brand_name',
        matchedText: match[0],
        context,
        confidence: 1.0,
        sentiment: detectSimpleSentiment(context, match[0]),
      });
      break; // One match per alias is enough
    }
  }

  // Stage 2: Domain mention in text (e.g., "according to acme.com")
  const domainRegex = new RegExp(`\\b${escapeRegex(params.projectDomain)}\\b`, 'gi');
  let domainMatch;
  while ((domainMatch = domainRegex.exec(text)) !== null) {
    const start = Math.max(0, domainMatch.index - 100);
    const end = Math.min(text.length, domainMatch.index + domainMatch[0].length + 100);

    // Only add if not already captured by URL extraction
    if (!mentions.some(m => m.mentionType === 'direct_citation')) {
      mentions.push({
        mentionType: 'brand_name',
        matchedText: domainMatch[0],
        context: text.slice(start, end),
        confidence: 0.9,
        sentiment: null,
      });
    }
    break;
  }

  // Stage 3: Fuzzy matching (Levenshtein distance ≤ 2 for brand names ≥ 5 chars)
  // Only attempt if we haven't found text-based mentions yet
  if (mentions.length === 0 || (mentions.length === 1 && mentions[0].mentionType === 'direct_citation')) {
    for (const name of allNames) {
      if (name.length < 5) continue; // Too short for reliable fuzzy matching

      const fuzzyMatch = findFuzzyMatch(text, name, 2);
      if (fuzzyMatch) {
        const start = Math.max(0, fuzzyMatch.index - 100);
        const end = Math.min(text.length, fuzzyMatch.index + fuzzyMatch.text.length + 100);

        mentions.push({
          mentionType: 'indirect_mention',
          matchedText: fuzzyMatch.text,
          context: text.slice(start, end),
          confidence: 0.7,
          sentiment: null,
        });
        break;
      }
    }
  }

  // If nothing found at all
  if (mentions.length === 0) {
    mentions.push({
      mentionType: 'not_found',
      matchedText: '',
      context: '',
      confidence: 1.0,
      sentiment: null,
    });
  }

  return mentions;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds a fuzzy match for `target` within `text` using Levenshtein distance.
 * Only considers words of similar length to the target.
 */
function findFuzzyMatch(
  text: string,
  target: string,
  maxDistance: number,
): { text: string; index: number } | null {
  const words = text.split(/\s+/);
  const targetLower = target.toLowerCase();

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z0-9]/g, '');
    if (Math.abs(word.length - target.length) > maxDistance) continue;

    const distance = levenshteinDistance(word.toLowerCase(), targetLower);
    if (distance <= maxDistance && distance > 0) {
      const index = text.indexOf(words[i]);
      return { text: words[i], index };
    }
  }
  return null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Simple keyword-based sentiment detection.
 * Checks for positive/negative signal words near the brand mention.
 * For MVP — can be upgraded to LLM-based sentiment analysis later.
 */
function detectSimpleSentiment(context: string, _brand: string): SentimentType | null {
  const lower = context.toLowerCase();

  const positiveSignals = [
    'recommend', 'best', 'top', 'leading', 'excellent', 'great',
    'popular', 'trusted', 'reliable', 'innovative', 'powerful', 'highly rated',
  ];
  const negativeSignals = [
    'avoid', 'worst', 'poor', 'expensive', 'complicated', 'outdated',
    'unreliable', 'limited', 'lacks', 'downside', 'drawback', 'issue',
  ];

  const posCount = positiveSignals.filter(s => lower.includes(s)).length;
  const negCount = negativeSignals.filter(s => lower.includes(s)).length;

  if (posCount > negCount) return 'positive';
  if (negCount > posCount) return 'negative';
  return 'neutral';
}
