"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { format, subDays } from "date-fns";

function dateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function useDateRange() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") || dateStr(subDays(new Date(), 7));
  const to = searchParams.get("to") || dateStr(new Date());

  const setRange = useCallback(
    (newFrom: string, newTo: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("from", newFrom);
      params.set("to", newTo);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const preset = useMemo(() => {
    const today = dateStr(new Date());
    if (to === today) {
      if (from === dateStr(subDays(new Date(), 7))) return "last7days" as const;
      if (from === dateStr(subDays(new Date(), 30))) return "last30days" as const;
      if (from === dateStr(subDays(new Date(), 90))) return "last90days" as const;
    }
    return "custom" as const;
  }, [from, to]);

  return { from, to, setRange, preset };
}
