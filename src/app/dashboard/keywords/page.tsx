import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { KeywordsContent } from "@/components/dashboard/keywords-content";

export default function KeywordsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Keywords</h2>
        <p className="text-sm text-muted-foreground">Manage the keywords you&apos;re tracking across AI engines</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <KeywordsContent />
      </Suspense>
    </div>
  );
}
