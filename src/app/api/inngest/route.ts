import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { alertEvaluator } from '@/lib/inngest';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    alertEvaluator,
    // Add other functions as they are implemented:
    // keywordMonitor,
    // citationExtractor,
    // analyticsSync,
  ],
});
