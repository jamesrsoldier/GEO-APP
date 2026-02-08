import { eq, isNull, and } from 'drizzle-orm';
import { inngest } from '../client';
import { getDb } from '@/lib/db';
import {
  projects,
  competitors,
  queryResults,
  citations,
  brandMentions,
  competitorCitations,
} from '@/lib/db/schema';
import { extractCitations, classifyCitations } from '@/lib/citations/extractor';
import { detectBrandMentions } from '@/lib/citations/mention-detector';

/**
 * Citation Extractor — Inngest Function
 *
 * Triggered by "monitoring/results.ready" after the keyword monitor completes.
 * Processes raw AI engine responses into structured citations, brand mentions,
 * and competitor citations.
 *
 * Steps:
 *   1. load-context — Fetch project, competitors, and unprocessed query results
 *   2. process-{resultId} — For each result: extract citations, detect mentions, store
 *   3. trigger-alerts — Emit "alerts/evaluate" event for this project
 */
export const citationExtractor = inngest.createFunction(
  {
    id: 'citation-extractor',
    concurrency: { limit: 5 },
    retries: 2,
    cancelOn: [],
  },
  { event: 'monitoring/results.ready' },
  async ({ event, step }) => {
    const { projectId, queryRunId } = event.data;
    const db = getDb();

    // Step 1: Load project context, competitors, and unprocessed results
    const context = await step.run('load-context', async () => {
      const [project] = await db
        .select({
          id: projects.id,
          domain: projects.domain,
          brandName: projects.brandName,
          brandAliases: projects.brandAliases,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const projectCompetitors = await db
        .select({
          id: competitors.id,
          domain: competitors.domain,
        })
        .from(competitors)
        .where(eq(competitors.projectId, projectId));

      const unprocessedResults = await db
        .select({
          id: queryResults.id,
          queryRunId: queryResults.queryRunId,
          projectId: queryResults.projectId,
          keywordId: queryResults.keywordId,
          engineType: queryResults.engineType,
          rawResponse: queryResults.rawResponse,
          citationUrls: queryResults.citationUrls,
        })
        .from(queryResults)
        .where(
          and(
            eq(queryResults.queryRunId, queryRunId),
            isNull(queryResults.processedAt),
          ),
        );

      return {
        project: {
          ...project,
          brandAliases: project.brandAliases ?? [],
        },
        competitors: projectCompetitors,
        results: unprocessedResults,
      };
    });

    // Step 2: Process each query result
    for (const result of context.results) {
      await step.run(`process-${result.id}`, async () => {
        // a) CITATION EXTRACTION
        const extracted = extractCitations({
          structuredCitations: result.citationUrls ?? [],
          rawResponseText: result.rawResponse,
        });

        const classified = classifyCitations({
          citations: extracted,
          projectDomain: context.project.domain,
          competitors: context.competitors,
        });

        // Insert citations into DB
        if (classified.length > 0) {
          await db.insert(citations).values(
            classified.map(c => ({
              queryResultId: result.id,
              projectId: context.project.id,
              keywordId: result.keywordId,
              engineType: result.engineType,
              citedUrl: c.url,
              citedDomain: c.domain,
              position: c.position,
              isBrandCitation: c.isBrandCitation,
            })),
          );
        }

        // Insert competitor citations
        const competitorHits = classified.filter(c => c.matchedCompetitorId !== null);
        if (competitorHits.length > 0) {
          await db.insert(competitorCitations).values(
            competitorHits.map(c => ({
              queryResultId: result.id,
              projectId: context.project.id,
              competitorId: c.matchedCompetitorId!,
              keywordId: result.keywordId,
              engineType: result.engineType,
              citedUrl: c.url,
              position: c.position,
            })),
          );
        }

        // b) BRAND MENTION DETECTION
        const hasCitationMatch = classified.some(c => c.isBrandCitation);
        const mentions = detectBrandMentions({
          responseText: result.rawResponse,
          brandName: context.project.brandName,
          brandAliases: context.project.brandAliases,
          projectDomain: context.project.domain,
          hasCitationMatch,
        });

        if (mentions.length > 0) {
          await db.insert(brandMentions).values(
            mentions.map(m => ({
              queryResultId: result.id,
              projectId: context.project.id,
              keywordId: result.keywordId,
              engineType: result.engineType,
              mentionType: m.mentionType,
              matchedText: m.matchedText,
              context: m.context,
              confidence: m.confidence,
              sentiment: m.sentiment,
            })),
          );
        }

        // c) Mark result as processed
        await db
          .update(queryResults)
          .set({ processedAt: new Date() })
          .where(eq(queryResults.id, result.id));
      });
    }

    // Step 3: Trigger alert evaluation
    await step.sendEvent('trigger-alerts', {
      name: 'alerts/evaluate',
      data: { projectId: context.project.id },
    });

    return {
      processedCount: context.results.length,
      projectId,
      queryRunId,
    };
  },
);
