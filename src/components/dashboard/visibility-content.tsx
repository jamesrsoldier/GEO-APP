"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useDateRange } from "@/hooks/use-date-range";
import { useVisibilityData } from "@/hooks/use-dashboard-data";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EngineBadge } from "./engine-badge";
import { TrendIndicator } from "@/components/shared/trend-indicator";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { VisibilityByKeyword } from "@/types";

type SortField = "keyword" | "overallScore" | "confidence" | "trend";
type SortDir = "asc" | "desc";

export function VisibilityContent() {
  const { projectId, isLoading: projectLoading } = useProject();
  const { from, to } = useDateRange();
  const { data, isLoading, error, mutate } = useVisibilityData(projectId, from, to);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("overallScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (projectLoading || isLoading) return <TableSkeleton rows={10} />;
  if (error) return <InlineError message="Failed to load visibility data" onRetry={() => mutate()} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<Eye className="h-6 w-6" />}
        title="No visibility data"
        description="Add keywords and run a monitoring scan to see visibility data."
        action={{ label: "Add Keywords", href: "/dashboard/keywords" }}
      />
    );
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortField === "keyword") return mul * a.keyword.localeCompare(b.keyword);
    return mul * ((a[sortField] ?? 0) - (b[sortField] ?? 0));
  });

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="cursor-pointer" onClick={() => handleSort("keyword")}>
                Keyword {sortField === "keyword" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("overallScore")}>
                Score {sortField === "overallScore" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("confidence")}>
                Confidence {sortField === "confidence" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead>Engines</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("trend")}>
                Trend {sortField === "trend" && (sortDir === "asc" ? "↑" : "↓")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((kw) => (
              <KeywordRow
                key={kw.keywordId}
                keyword={kw}
                expanded={expandedId === kw.keywordId}
                onToggle={() => setExpandedId(expandedId === kw.keywordId ? null : kw.keywordId)}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KeywordRow({
  keyword: kw,
  expanded,
  onToggle,
}: {
  keyword: VisibilityByKeyword;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </TableCell>
        <TableCell className="font-medium">{kw.keyword}</TableCell>
        <TableCell className="text-muted-foreground">{kw.category || "—"}</TableCell>
        <TableCell className="text-right font-medium">{kw.overallScore.toFixed(0)}%</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full", kw.confidence >= 60 ? "bg-emerald-500" : kw.confidence >= 30 ? "bg-amber-500" : "bg-red-500")}
                style={{ width: `${kw.confidence}%` }}
              />
            </div>
            <span className="text-sm">{kw.confidence.toFixed(0)}%</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-1 flex-wrap">
            {kw.byEngine
              .filter((e) => e.cited)
              .map((e) => (
                <EngineBadge key={e.engine} engine={e.engine} showLabel={false} />
              ))}
            {kw.byEngine.filter((e) => e.cited).length === 0 && <span className="text-muted-foreground">—</span>}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <TrendIndicator value={kw.trend} />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <div className="py-2 px-4">
              <p className="text-sm font-medium mb-2">Engine Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kw.byEngine.map((e) => (
                  <div key={e.engine} className="flex items-center gap-2 text-sm">
                    <EngineBadge engine={e.engine} />
                    <span className="text-muted-foreground">
                      {e.cited ? `${e.score.toFixed(0)}%` : "Not cited"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
