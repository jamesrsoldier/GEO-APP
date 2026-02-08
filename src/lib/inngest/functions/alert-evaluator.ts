import { inngest } from '../client';

// Stub: alert-evaluator — implemented in Component 7
export const alertEvaluator = inngest.createFunction(
  {
    id: 'alert-evaluator',
    retries: 3,
  },
  { event: 'alerts/evaluate' },
  async ({ event }) => {
    // TODO: Implement in Component 7
    // Steps:
    //   1. Load enabled alerts for project
    //   2. Calculate current vs previous period metrics
    //   3. Evaluate alert conditions
    //   4. Create alertEvents for triggered alerts
    return { status: 'not_implemented', ...event.data };
  },
);
