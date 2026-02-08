import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { VisibilityContent } from "@/components/dashboard/visibility-content";

export default function VisibilityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Visibility</h2>
        <p className="text-sm text-muted-foreground">Keyword-level AI visibility breakdown</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <VisibilityContent />
      </Suspense>
    </div>
  );
}
