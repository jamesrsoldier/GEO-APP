import { Inngest } from 'inngest';

// Event type definitions for type-safe event sending
export type BeaconEvents = {
  'monitoring/run.triggered': {
    data: {
      projectId: string;
      queryRunId: string;
      engineTypes: string[];
      keywordIds: string[];
    };
  };
  'monitoring/results.ready': {
    data: {
      projectId: string;
      queryRunId: string;
    };
  };
  'alerts/evaluate': {
    data: {
      projectId: string;
    };
  };
  'analytics/sync.scheduled': {
    data: Record<string, never>;
  };
};

export const inngest = new Inngest({
  id: 'beacon',
  schemas: new Map() as never, // Type assertion for generic events
});
