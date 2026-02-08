import { inngest } from '../client';

// Stub: analytics-sync — implemented in Component 5
export const analyticsSync = inngest.createFunction(
  {
    id: 'analytics-sync',
    retries: 3,
  },
  { cron: '0 8 * * *' }, // 8 AM UTC daily
  async () => {
    // TODO: Implement in Component 5
    // Steps:
    //   1. Load projects with GA4/GSC configured
    //   2. Sync GA4 traffic data
    //   3. Sync GSC data
    return { status: 'not_implemented' };
  },
);
