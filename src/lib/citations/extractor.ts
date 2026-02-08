import { extractDomain } from '@/lib/utils';

// ============================================
// STAGE 1: URL EXTRACTION
// ============================================

export interface ExtractedCitation {
  url: string;
  domain: string;
  position: number;          // 1-based position in citation list
  source: 'structured' | 'text_extracted';
}

/**
 * Extracts citations from both structured citation arrays and raw response text.
 * Structured citations (from Perplexity/DataForSEO) are prioritized.
 * Additional URLs found in the raw text are appended with lower priority.
 */
export function extractCitations(params: {
  structuredCitations: string[];
  rawResponseText: string;
}): ExtractedCitation[] {
  const seen = new Set<string>();
  const results: ExtractedCitation[] = [];
  let position = 1;

  // First: add structured citations (highest quality)
  for (const url of params.structuredCitations) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({
        url: normalized,
        domain: extractDomain(normalized),
        position: position++,
        source: 'structured',
      });
    }
  }

  // Second: extract any additional URLs from response text
  const urlRegex = /https?:\/\/[^\s)}\]>"']+/g;
  const textUrls = params.rawResponseText.match(urlRegex) || [];
  for (const url of textUrls) {
    const normalized = normalizeUrl(url);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({
        url: normalized,
        domain: extractDomain(normalized),
        position: position++,
        source: 'text_extracted',
      });
    }
  }

  return results;
}

// ============================================
// STAGE 2: DOMAIN MATCHING
// ============================================

export interface ClassifiedCitation extends ExtractedCitation {
  isBrandCitation: boolean;
  matchedCompetitorId: string | null;
}

/**
 * Classifies each citation as a brand citation, competitor citation, or neither.
 * Handles subdomain matching (e.g., blog.example.com matches example.com).
 */
export function classifyCitations(params: {
  citations: ExtractedCitation[];
  projectDomain: string;
  competitors: { id: string; domain: string }[];
}): ClassifiedCitation[] {
  const projectDomainNorm = params.projectDomain.toLowerCase().replace(/^www\./, '');

  return params.citations.map(citation => {
    const citedDomainNorm = citation.domain.toLowerCase().replace(/^www\./, '');

    // Check if it matches the project's domain (exact or subdomain)
    const isBrandCitation = citedDomainNorm === projectDomainNorm ||
      citedDomainNorm.endsWith(`.${projectDomainNorm}`);

    // Check if it matches any competitor's domain
    let matchedCompetitorId: string | null = null;
    for (const comp of params.competitors) {
      const compDomainNorm = comp.domain.toLowerCase().replace(/^www\./, '');
      if (citedDomainNorm === compDomainNorm || citedDomainNorm.endsWith(`.${compDomainNorm}`)) {
        matchedCompetitorId = comp.id;
        break;
      }
    }

    return { ...citation, isBrandCitation, matchedCompetitorId };
  });
}

/**
 * Normalizes a URL by removing trailing slashes, fragments, and common tracking parameters.
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove fragments and common tracking params
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch {
    return url;
  }
}
