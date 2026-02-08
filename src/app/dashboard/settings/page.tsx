import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { SettingsContent } from "@/components/dashboard/settings-content";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Project Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your project configuration</p>
      </div>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
