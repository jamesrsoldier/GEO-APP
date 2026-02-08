import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { IntegrationsContent } from "@/components/dashboard/integrations-content";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
        <p className="text-sm text-muted-foreground">Connect your Google Analytics and Search Console accounts</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <IntegrationsContent />
      </Suspense>
    </div>
  );
}
