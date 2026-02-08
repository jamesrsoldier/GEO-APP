"use client";

import { useState } from "react";
import { Plus, Pause, Play, Trash2, Tags } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { useKeywords } from "@/hooks/use-dashboard-data";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { EmptyState } from "@/components/shared/empty-state";
import { PLAN_LIMITS } from "@/types";
import type { SubscriptionTier } from "@/types";

export function KeywordsContent() {
  const { projectId, project, isLoading: projectLoading } = useProject();
  const { data: keywords, isLoading, error, mutate } = useKeywords(projectId);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Tier comes from org-level billing; default to free when unknown
  const [tier] = useState<SubscriptionTier>("free");
  const limits = PLAN_LIMITS[tier];
  const keywordCount = keywords?.length ?? 0;

  if (projectLoading || isLoading) return <TableSkeleton rows={10} />;
  if (error) return <InlineError message="Failed to load keywords" onRetry={() => mutate()} />;

  const handleAdd = async () => {
    if (!projectId || !bulkText.trim()) return;
    setSaving(true);
    try {
      const lines = bulkText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const keywordsPayload = lines.map((keyword) => ({
        keyword,
        category: category || undefined,
      }));
      await fetch(`/api/projects/${projectId}/keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keywordsPayload }),
      });
      setBulkText("");
      setCategory("");
      setShowAddDialog(false);
      mutate();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (keywordId: string, isActive: boolean) => {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/keywords/${keywordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    mutate();
  };

  const handleDelete = async (keywordId: string) => {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}/keywords/${keywordId}`, { method: "DELETE" });
    mutate();
  };

  const newCount = bulkText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Using <span className="font-medium text-foreground">{keywordCount}</span> of{" "}
            <span className="font-medium text-foreground">{limits.maxKeywords}</span> keywords
          </p>
          <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (keywordCount / limits.maxKeywords) * 100)}%` }}
            />
          </div>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Keywords
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Keywords</DialogTitle>
              <DialogDescription>Enter one keyword per line to add them for tracking.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Keywords (one per line)</Label>
                <Textarea
                  rows={6}
                  placeholder={"best CRM software\nCRM comparison 2025\nwhat is the best CRM"}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kw-category">Category (optional)</Label>
                <Input
                  id="kw-category"
                  placeholder="e.g., CRM"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving || newCount === 0}>
                {saving ? "Adding..." : `Add ${newCount} Keyword${newCount !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!keywords || keywords.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="No keywords tracked"
          description="Add keywords to start monitoring your AI visibility across engines."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Visibility</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keywords.map((kw) => (
                  <TableRow key={kw.id}>
                    <TableCell className="font-medium">{kw.keyword}</TableCell>
                    <TableCell className="text-muted-foreground">{kw.category || "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={kw.isActive ? "default" : "secondary"}>
                        {kw.isActive ? "Active" : "Paused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {kw.latestVisibilityScore !== null ? `${kw.latestVisibilityScore.toFixed(0)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleActive(kw.id, kw.isActive)}
                          title={kw.isActive ? "Pause" : "Resume"}
                        >
                          {kw.isActive ? (
                            <Pause className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Play className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(kw.id)} title="Delete">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Plan: {tier.charAt(0).toUpperCase() + tier.slice(1)} ({limits.maxKeywords} keywords).{" "}
        {tier !== "growth" && (
          <a href="/dashboard/settings/billing" className="text-primary hover:underline">
            Upgrade for more keywords
          </a>
        )}
      </p>
    </div>
  );
}
