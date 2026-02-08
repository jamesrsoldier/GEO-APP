import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { BillingContent } from "@/components/dashboard/billing-content";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Billing</h2>
        <p className="text-sm text-muted-foreground">Manage your subscription and billing</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <BillingContent />
      </Suspense>
    </div>
  );
}
