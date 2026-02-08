"use client";

import { useCallback } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Preset = "last7days" | "last30days" | "last90days";

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

function dateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const presets: { label: string; value: Preset; days: number }[] = [
  { label: "Last 7 days", value: "last7days", days: 7 },
  { label: "Last 30 days", value: "last30days", days: 30 },
  { label: "Last 90 days", value: "last90days", days: 90 },
];

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const handlePreset = useCallback(
    (days: number) => {
      const toDate = new Date();
      const fromDate = subDays(toDate, days);
      onChange(dateStr(fromDate), dateStr(toDate));
    },
    [onChange]
  );

  const displayFrom = from ? format(new Date(from + "T00:00:00"), "MMM d, yyyy") : "";
  const displayTo = to ? format(new Date(to + "T00:00:00"), "MMM d, yyyy") : "";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-start text-left font-normal", !from && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {from ? (
            <span>
              {displayFrom} - {displayTo}
            </span>
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex flex-col gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.value}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => handlePreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="mt-3 border-t pt-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => onChange(e.target.value, to)}
              className="rounded border px-2 py-1 text-sm"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <label className="text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => onChange(from, e.target.value)}
              className="ml-4 rounded border px-2 py-1 text-sm"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
