"use client";

import { useState } from "react";
import { CreditCard, Check, ExternalLink } from "lucide-react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { InlineError } from "@/components/shared/error-boundary";
import { PLAN_LIMITS } from "@/types";
import type { SubscriptionTier } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BillingData {
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: string | null;
}

const plans: { tier: SubscriptionTier; name: string; price: string; features: string[] }[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0/mo",
    features: [
      `${PLAN_LIMITS.free.maxKeywords} keywords`,
      `${PLAN_LIMITS.free.maxProjects} project`,
      `${PLAN_LIMITS.free.engines.length} engine (Perplexity)`,
      "Daily monitoring",
    ],
  },
  {
    tier: "starter",
    name: "Starter",
    price: "$99/mo",
    features: [
      `${PLAN_LIMITS.starter.maxKeywords} keywords`,
      `${PLAN_LIMITS.starter.maxProjects} projects`,
      `${PLAN_LIMITS.starter.engines.length} engines`,
      "GA4 integration",
      "Daily monitoring",
    ],
  },
  {
    tier: "growth",
    name: "Growth",
    price: "$299/mo",
    features: [
      `${PLAN_LIMITS.growth.maxKeywords} keywords`,
      `${PLAN_LIMITS.growth.maxProjects} projects`,
      `${PLAN_LIMITS.growth.engines.length} engines`,
      "GA4 + GSC integration",
      "Twice daily monitoring",
      "API access",
    ],
  },
];

export function BillingContent() {
  const { data, isLoading, error } = useSWR<BillingData>("/api/billing/subscription", fetcher);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={4} />;
  if (error) return <InlineError message="Failed to load billing information" />;

  const currentTier = data?.tier || "free";

  const handleManage = async () => {
    setLoadingAction("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const { portalUrl } = await res.json();
      if (portalUrl) window.location.href = portalUrl;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpgrade = async (tier: SubscriptionTier) => {
    setLoadingAction(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const { checkoutUrl } = await res.json();
      if (checkoutUrl) window.location.href = checkoutUrl;
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
          <CardDescription>
            {currentTier === "free"
              ? "You're on the free plan."
              : `You're on the ${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-lg font-semibold">
                {plans.find((p) => p.tier === currentTier)?.name} — {plans.find((p) => p.tier === currentTier)?.price}
              </p>
              {data?.status && (
                <Badge variant={data.status === "active" ? "default" : "destructive"} className="mt-1">
                  {data.status}
                </Badge>
              )}
              {data?.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground mt-1">
                  Renews: {new Date(data.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {currentTier !== "free" && (
              <Button variant="outline" size="sm" onClick={handleManage} disabled={loadingAction === "portal"}>
                <ExternalLink className="mr-2 h-4 w-4" />
                {loadingAction === "portal" ? "Loading..." : "Manage Subscription"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-base font-semibold mb-4">Compare Plans</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.tier === currentTier;
            return (
              <Card key={plan.tier} className={isCurrent ? "border-primary" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">Current</Badge>
                    )}
                  </div>
                  <p className="text-2xl font-bold">{plan.price}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && plan.tier !== "free" && (
                    <Button
                      className="mt-4 w-full"
                      size="sm"
                      onClick={() => handleUpgrade(plan.tier)}
                      disabled={loadingAction === plan.tier}
                    >
                      {loadingAction === plan.tier ? "Loading..." : "Upgrade"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
