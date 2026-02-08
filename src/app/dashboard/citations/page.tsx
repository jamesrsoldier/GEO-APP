import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { CitationsContent } from "@/components/dashboard/citations-content";

export default function CitationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Citations</h2>
        <p className="text-sm text-muted-foreground">Track where and when your brand is cited</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <CitationsContent />
      </Suspense>
    </div>
  );
}
