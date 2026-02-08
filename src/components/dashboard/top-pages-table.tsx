"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EngineBadge } from "./engine-badge";
import type { EngineType } from "@/types";

interface TopPagesTableProps {
  pages: { url: string; citations: number; engines: EngineType[] }[];
}

export function TopPagesTable({ pages }: TopPagesTableProps) {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Top Cited Pages</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead className="text-right">Citations</TableHead>
              <TableHead>Engines</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No citations found yet
                </TableCell>
              </TableRow>
            ) : (
              pages.map((page) => (
                <TableRow key={page.url}>
                  <TableCell className="font-medium max-w-[300px] truncate" title={page.url}>
                    {page.url}
                  </TableCell>
                  <TableCell className="text-right">{page.citations}</TableCell>
                  <TableCell>
                    <div className="flex gap-2 flex-wrap">
                      {page.engines.map((engine) => (
                        <EngineBadge key={engine} engine={engine} showLabel={false} />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
