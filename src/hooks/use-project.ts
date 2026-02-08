"use client";

import { useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import useSWR from "swr";
import type { ProjectResponse } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PROJECT_STORAGE_KEY = "beacon-last-project-id";

export function useProject() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: projects, isLoading: isLoadingProjects, error: projectsError } = useSWR<ProjectResponse[]>(
    "/api/projects",
    fetcher
  );

  const projectIdFromUrl = searchParams.get("projectId");
  const storedProjectId = typeof window !== "undefined" ? localStorage.getItem(PROJECT_STORAGE_KEY) : null;

  const projectId = projectIdFromUrl || storedProjectId || projects?.[0]?.id || null;

  const { data: project, isLoading: isLoadingProject, error: projectError } = useSWR<ProjectResponse>(
    projectId ? `/api/projects/${projectId}` : null,
    fetcher
  );

  useEffect(() => {
    if (projectId && typeof window !== "undefined") {
      localStorage.setItem(PROJECT_STORAGE_KEY, projectId);
    }
  }, [projectId]);

  const setProject = useCallback(
    (newProjectId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("projectId", newProjectId);
      router.replace(`${pathname}?${params.toString()}`);
      if (typeof window !== "undefined") {
        localStorage.setItem(PROJECT_STORAGE_KEY, newProjectId);
      }
    },
    [router, pathname, searchParams]
  );

  return {
    project: project || null,
    projects: projects || [],
    projectId,
    isLoading: isLoadingProjects || isLoadingProject,
    error: projectsError || projectError,
    setProject,
  };
}
