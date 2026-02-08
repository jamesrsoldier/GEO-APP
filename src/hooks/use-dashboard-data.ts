"use client";

import useSWR from "swr";
import type {
  DashboardOverview,
  VisibilityByKeyword,
  CitationDetail,
  CompetitorBenchmark,
  TrafficOverview,
  KeywordResponse,
  AlertEventResponse,
  CompetitorResponse,
} from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

const SWR_CONFIG = {
  refreshInterval: 60000,
  revalidateOnFocus: true,
  dedupingInterval: 10000,
};

function buildUrl(base: string, params?: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(base, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
  }
  return url.toString();
}

export function useDashboardOverview(projectId: string | null, from: string, to: string) {
  return useSWR<DashboardOverview>(
    projectId ? buildUrl(`/api/projects/${projectId}/dashboard/overview`, { from, to }) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useVisibilityData(projectId: string | null, from: string, to: string) {
  return useSWR<VisibilityByKeyword[]>(
    projectId ? buildUrl(`/api/projects/${projectId}/dashboard/visibility`, { from, to }) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useCitations(
  projectId: string | null,
  params: { engine?: string; keyword?: string; from?: string; to?: string; page?: number; limit?: number }
) {
  return useSWR<{ data: CitationDetail[]; total: number }>(
    projectId ? buildUrl(`/api/projects/${projectId}/citations`, params) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useCitationStats(projectId: string | null, from: string, to: string) {
  return useSWR<{
    totalCitations: number;
    byEngine: { engine: string; count: number }[];
    byKeyword: { keyword: string; count: number }[];
    overTime: { date: string; total: number; brand: number }[];
  }>(
    projectId ? buildUrl(`/api/projects/${projectId}/citations/stats`, { from, to }) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useCompetitorBenchmarks(projectId: string | null, from: string, to: string) {
  return useSWR<CompetitorBenchmark[]>(
    projectId ? buildUrl(`/api/projects/${projectId}/competitors/benchmark`, { from, to }) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useCompetitors(projectId: string | null) {
  return useSWR<CompetitorResponse[]>(
    projectId ? `/api/projects/${projectId}/competitors` : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useTrafficData(projectId: string | null, from: string, to: string) {
  return useSWR<TrafficOverview>(
    projectId ? buildUrl(`/api/projects/${projectId}/dashboard/traffic`, { from, to }) : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useKeywords(projectId: string | null) {
  return useSWR<KeywordResponse[]>(
    projectId ? `/api/projects/${projectId}/keywords` : null,
    fetcher,
    SWR_CONFIG
  );
}

export function useAlertEvents(projectId: string | null, unreadOnly?: boolean) {
  return useSWR<AlertEventResponse[]>(
    projectId
      ? buildUrl(`/api/projects/${projectId}/alerts/events`, { unreadOnly: unreadOnly || undefined })
      : null,
    fetcher,
    SWR_CONFIG
  );
}
