import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { CompetitorsContent } from "@/components/dashboard/competitors-content";

export default function CompetitorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Competitors</h2>
        <p className="text-sm text-muted-foreground">Benchmark your AI visibility against competitors</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <CompetitorsContent />
      </Suspense>
    </div>
  );
}
