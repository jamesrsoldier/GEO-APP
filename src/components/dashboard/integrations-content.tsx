"use client";

import { ExternalLink, Check, X, Link2 } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";

export function IntegrationsContent() {
  const { project, projectId, isLoading } = useProject();

  if (isLoading) return <TableSkeleton rows={4} />;

  if (!project) {
    return (
      <EmptyState
        icon={<Link2 className="h-6 w-6" />}
        title="No project selected"
        description="Select a project to manage integrations."
      />
    );
  }

  const handleConnect = async () => {
    if (!projectId) return;
    // Redirect to Google OAuth flow
    window.location.href = `/api/projects/${projectId}/integrations/google/connect`;
  };

  const handleDisconnect = async () => {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/integrations/google/disconnect`, { method: "POST" });
    window.location.reload();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Google Analytics (GA4)</CardTitle>
              <CardDescription className="mt-1">Track AI referral traffic and conversions</CardDescription>
            </div>
            {project.ga4Connected ? (
              <Badge variant="default" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                <Check className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <X className="mr-1 h-3 w-3" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {project.ga4Connected ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Your GA4 property is connected and syncing data.</p>
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Connect GA4 to track visitors from AI answer engines and attribute traffic to citations.
              </p>
              <Button size="sm" onClick={handleConnect}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect Google Analytics
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Google Search Console</CardTitle>
              <CardDescription className="mt-1">Monitor search performance alongside AI visibility</CardDescription>
            </div>
            {project.gscConnected ? (
              <Badge variant="default" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                <Check className="mr-1 h-3 w-3" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <X className="mr-1 h-3 w-3" />
                Not Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {project.gscConnected ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Your Search Console site is connected and syncing data.</p>
              <Button variant="outline" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Connect Search Console to compare traditional search metrics with AI visibility. Requires Growth plan.
              </p>
              <Button size="sm" onClick={handleConnect}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect Search Console
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
