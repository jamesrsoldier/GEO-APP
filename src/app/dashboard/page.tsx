import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { OverviewContent } from "@/components/dashboard/overview-content";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">Your AI visibility at a glance</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}
