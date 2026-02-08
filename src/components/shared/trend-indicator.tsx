import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrendIndicatorProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function TrendIndicator({ value, suffix = "%", className }: TrendIndicatorProps) {
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const Icon = isNeutral ? ArrowRight : isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isPositive && "text-emerald-600",
        !isPositive && !isNeutral && "text-red-600",
        isNeutral && "text-muted-foreground",
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {isPositive && "+"}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
