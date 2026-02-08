"use client";

import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell,
} from "recharts";
import { BarChart3, ExternalLink } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useDateRange } from "@/hooks/use-date-range";
import { useTrafficData } from "@/hooks/use-dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { formatNumber } from "@/lib/utils";

const SOURCE_COLORS: Record<string, string> = {
  "chatgpt.com": "#10A37F",
  "perplexity.ai": "#20808D",
  "claude.ai": "#D97706",
  "you.com": "#8b5cf6",
  "phind.com": "#06b6d4",
  "copilot.microsoft.com": "#00BCF2",
};

export function TrafficContent() {
  const { projectId, project, isLoading: projectLoading } = useProject();
  const { from, to } = useDateRange();
  const { data, isLoading, error, mutate } = useTrafficData(projectId, from, to);

  if (projectLoading || isLoading) return <DashboardSkeleton />;

  if (!project?.ga4Connected) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-6 w-6" />}
        title="GA4 not connected"
        description="Connect Google Analytics to track AI referral traffic and conversions."
        action={{ label: "Connect GA4", href: "/dashboard/settings/integrations" }}
      />
    );
  }

  if (error) return <InlineError message="Failed to load traffic data" onRetry={() => mutate()} />;
  if (!data) return <DashboardSkeleton />;

  const chartData = data.overTime.map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date + "T00:00:00"), "MMM d"),
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">AI Sessions</p>
            <p className="text-2xl font-bold">{formatNumber(data.totalAiSessions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">AI Conversions</p>
            <p className="text-2xl font-bold">{formatNumber(data.totalAiConversions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Engagement Rate</p>
            <p className="text-2xl font-bold">{(data.engagementRate * 100).toFixed(0)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Traffic Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Area type="monotone" dataKey="sessions" name="Sessions" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Traffic by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bySource} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="source" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
                    {data.bySource.map((entry) => (
                      <Cell key={entry.source} fill={SOURCE_COLORS[entry.source] || "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Landing Pages</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Engagement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topLandingPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">No data</TableCell>
                  </TableRow>
                ) : (
                  data.topLandingPages.map((p) => (
                    <TableRow key={p.page}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={p.page}>
                        <span className="flex items-center gap-1">
                          {p.page}
                          <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(p.sessions)}</TableCell>
                      <TableCell className="text-right">{(p.engagementRate * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
