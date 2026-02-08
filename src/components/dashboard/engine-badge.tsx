import { cn } from "@/lib/utils";
import { ENGINE_COLORS, ENGINE_LABELS } from "@/lib/constants";
import type { EngineType } from "@/types";

interface EngineBadgeProps {
  engine: EngineType;
  showLabel?: boolean;
  className?: string;
}

export function EngineBadge({ engine, showLabel = true, className }: EngineBadgeProps) {
  const color = ENGINE_COLORS[engine];
  const label = ENGINE_LABELS[engine];

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span
        className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
