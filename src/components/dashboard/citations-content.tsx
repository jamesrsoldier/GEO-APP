"use client";

import { useState } from "react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Quote, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useDateRange } from "@/hooks/use-date-range";
import { useCitations, useCitationStats } from "@/hooks/use-dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EngineBadge } from "./engine-badge";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { ALL_ENGINES, ENGINE_LABELS } from "@/lib/constants";

const PAGE_SIZE = 20;

export function CitationsContent() {
  const { projectId, isLoading: projectLoading } = useProject();
  const { from, to } = useDateRange();
  const [engine, setEngine] = useState<string>("");
  const [page, setPage] = useState(1);

  const {
    data: citations,
    isLoading,
    error,
    mutate,
  } = useCitations(projectId, { engine: engine || undefined, from, to, page, limit: PAGE_SIZE });

  const { data: stats } = useCitationStats(projectId, from, to);

  if (projectLoading || isLoading) return <TableSkeleton rows={10} />;
  if (error) return <InlineError message="Failed to load citations" onRetry={() => mutate()} />;

  const totalPages = citations ? Math.ceil(citations.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      {stats && (
        <div className="flex flex-wrap gap-4">
          <Card className="flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Citations</p>
              <p className="text-2xl font-bold">{stats.totalCitations}</p>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Brand Citations</p>
              <p className="text-2xl font-bold">
                {stats.overTime.reduce((sum, d) => sum + d.brand, 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Competitor Citations</p>
              <p className="text-2xl font-bold">
                {stats.totalCitations - stats.overTime.reduce((sum, d) => sum + d.brand, 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Select value={engine} onValueChange={(v) => { setEngine(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Engines" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Engines</SelectItem>
            {ALL_ENGINES.map((e) => (
              <SelectItem key={e} value={e}>{ENGINE_LABELS[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!citations || citations.data.length === 0 ? (
        <EmptyState
          icon={<Quote className="h-6 w-6" />}
          title="No citations found"
          description="Run a monitoring scan to detect citations across AI engines."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead>Engine</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-center">Position</TableHead>
                    <TableHead className="text-center">Brand</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {citations.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.keyword}</TableCell>
                      <TableCell><EngineBadge engine={c.engineType} /></TableCell>
                      <TableCell className="max-w-[200px] truncate" title={c.citedUrl}>{c.citedUrl}</TableCell>
                      <TableCell className="text-center">{c.position ? `#${c.position}` : "—"}</TableCell>
                      <TableCell className="text-center">
                        {c.isBrandCitation ? (
                          <Check className="h-4 w-4 text-emerald-500 inline" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground inline" />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(c.createdAt), "MMM d")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, citations.total)} of {citations.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {stats && stats.overTime.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Citation Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.overTime.map((d) => ({ ...d, dateLabel: format(new Date(d.date + "T00:00:00"), "MMM d") }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="brand" name="Brand" stroke="#10A37F" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
