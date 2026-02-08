import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import {
  keywordMonitor,
  scheduledMonitor,
  citationExtractor,
  analyticsSync,
  alertEvaluator,
} from '@/lib/inngest';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    keywordMonitor,
    scheduledMonitor,
    citationExtractor,
    analyticsSync,
    alertEvaluator,
  ],
});
