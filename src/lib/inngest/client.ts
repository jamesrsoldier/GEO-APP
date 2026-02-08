import { EventSchemas, Inngest } from 'inngest';

// Beacon event schemas for type-safe event handling
type BeaconEvents = {
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
};

export const inngest = new Inngest({
  id: 'beacon',
  schemas: new EventSchemas().fromRecord<BeaconEvents>(),
});
