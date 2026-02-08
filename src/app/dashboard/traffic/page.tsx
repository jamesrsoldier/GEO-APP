import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { TrafficContent } from "@/components/dashboard/traffic-content";

export default function TrafficPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">AI Referral Traffic</h2>
        <p className="text-sm text-muted-foreground">Track visitors from AI answer engines via GA4</p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <TrafficContent />
      </Suspense>
    </div>
  );
}
