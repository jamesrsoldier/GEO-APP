"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Plus, Users, Trash2 } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useDateRange } from "@/hooks/use-date-range";
import { useCompetitorBenchmarks, useCompetitors } from "@/hooks/use-dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { Check, X } from "lucide-react";

const COLORS = ["hsl(var(--primary))", "#ef4444", "#f97316", "#3b82f6", "#8b5cf6", "#06b6d4", "#84cc16"];

export function CompetitorsContent() {
  const { projectId, project, isLoading: projectLoading } = useProject();
  const { from, to } = useDateRange();
  const { data: benchmarks, isLoading, error, mutate: mutateBenchmarks } = useCompetitorBenchmarks(projectId, from, to);
  const { data: competitors, mutate: mutateCompetitors } = useCompetitors(projectId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);

  if (projectLoading || isLoading) return <DashboardSkeleton />;
  if (error) return <InlineError message="Failed to load competitor data" onRetry={() => mutateBenchmarks()} />;

  const handleAdd = async () => {
    if (!projectId || !newName || !newDomain) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, domain: newDomain }),
      });
      setNewName("");
      setNewDomain("");
      setShowAddDialog(false);
      mutateCompetitors();
      mutateBenchmarks();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (competitorId: string) => {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/competitors/${competitorId}`, { method: "DELETE" });
    mutateCompetitors();
    mutateBenchmarks();
  };

  // Prepare pie chart data
  const brandSoV = benchmarks
    ? 100 - benchmarks.reduce((sum, b) => sum + b.shareOfVoice, 0)
    : 100;
  const pieData = [
    { name: project?.brandName || "You", value: Math.max(0, brandSoV) },
    ...(benchmarks || []).map((b) => ({ name: b.competitorName, value: b.shareOfVoice })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
              <DialogDescription>Track a competitor&apos;s AI visibility alongside yours.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="comp-name">Name</Label>
                <Input id="comp-name" placeholder="HubSpot" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp-domain">Domain</Label>
                <Input id="comp-domain" placeholder="hubspot.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving || !newName || !newDomain}>
                {saving ? "Adding..." : "Add Competitor"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {(!benchmarks || benchmarks.length === 0) && (!competitors || competitors.length === 0) ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No competitors tracked"
          description="Add competitors to compare AI visibility and share of voice."
        />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Share of Voice</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label={({ name, value }: any) => `${name}: ${Number(value).toFixed(0)}%`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <Tooltip formatter={(value: any) => `${Number(value).toFixed(1)}%`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Competitor List</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competitor</TableHead>
                      <TableHead className="text-right">SoV</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(benchmarks || []).map((b) => (
                      <TableRow key={b.competitorId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{b.competitorName}</p>
                            <p className="text-xs text-muted-foreground">{b.competitorDomain}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{b.shareOfVoice.toFixed(0)}%</TableCell>
                        <TableCell className="text-right">{b.visibilityScore.toFixed(0)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(b.competitorId)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {benchmarks && benchmarks.length > 0 && benchmarks[0].topKeywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Head-to-Head by Keyword</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Keyword</TableHead>
                      <TableHead className="text-center">{project?.brandName || "You"}</TableHead>
                      {benchmarks.map((b) => (
                        <TableHead key={b.competitorId} className="text-center">{b.competitorName}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {benchmarks[0].topKeywords.map((kw) => (
                      <TableRow key={kw.keyword}>
                        <TableCell className="font-medium">{kw.keyword}</TableCell>
                        <TableCell className="text-center">
                          {kw.cited ? (
                            <Check className="h-4 w-4 text-emerald-500 inline" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground inline" />
                          )}
                        </TableCell>
                        {benchmarks.map((b) => {
                          const compKw = b.topKeywords.find((k) => k.keyword === kw.keyword);
                          return (
                            <TableCell key={b.competitorId} className="text-center">
                              {compKw?.cited ? (
                                <Check className="h-4 w-4 text-emerald-500 inline" />
                              ) : (
                                <X className="h-4 w-4 text-muted-foreground inline" />
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
