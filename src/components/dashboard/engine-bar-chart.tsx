"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ENGINE_COLORS, ENGINE_LABELS } from "@/lib/constants";
import type { EngineType } from "@/types";

interface EngineBarChartProps {
  data: { engine: EngineType; score: number }[];
}

export function EngineBarChart({ data }: EngineBarChartProps) {
  const formatted = data.map((d) => ({
    name: ENGINE_LABELS[d.engine],
    score: d.score,
    engine: d.engine,
  }));

  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle className="text-base font-semibold">By Engine</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted} layout="vertical" margin={{ left: 20 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [`${Number(value).toFixed(1)}`, "Score"]}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {formatted.map((entry) => (
                  <Cell key={entry.engine} fill={ENGINE_COLORS[entry.engine]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
