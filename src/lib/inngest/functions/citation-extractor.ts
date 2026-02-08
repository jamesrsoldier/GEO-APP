import { inngest } from '../client';

// Stub: citation-extractor — implemented in Component 4
export const citationExtractor = inngest.createFunction(
  {
    id: 'citation-extractor',
    retries: 3,
  },
  { event: 'monitoring/results.ready' },
  async ({ event }) => {
    // TODO: Implement in Component 4
    // Steps:
    //   1. Load unprocessed queryResults for this run
    //   2. Extract citations (URL parsing, domain matching)
    //   3. Detect brand mentions (exact + fuzzy matching)
    //   4. Mark results as processed
    //   5. Trigger alert evaluation
    return { status: 'not_implemented', ...event.data };
  },
);
