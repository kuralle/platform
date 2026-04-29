import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";

import { formatPct, formatUsd } from "@/lib/format";
import { makeBatches } from "@/mocks";
import type { BatchStatus } from "@/types/domain";

export const Route = createFileRoute("/_app/batches/")({
  component: BatchesListRoute,
});

function BatchesListRoute() {
  const batches = useMemo(() => makeBatches(6), []);

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Operate"
        title="Outbound batches"
        description="Schedule, monitor, and pause outbound campaigns. Each row is a TCPA-vetted run."
        actions={
          <Button nativeButton={false} render={<Link to="/batches/new" />}>
            <Plus size={16} /> New batch
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Vertical</TableHead>
              <TableHead className="text-right">Recipients</TableHead>
              <TableHead className="text-right">Booked</TableHead>
              <TableHead className="text-right">Booking %</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Recovered $</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => {
              const bookedPct = b.completed ? b.booked / b.completed : 0;
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <StatusPie
                      total={b.totalRecipients}
                      completed={b.completed}
                      booked={b.booked}
                      failed={b.failed}
                    />
                  </TableCell>
                  <TableCell className="text-[13px] font-medium">
                    {b.name}
                    <div className="font-mono text-[11px] tabular-nums text-muted-foreground">{b.id}</div>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{b.agentName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {b.vertical.replace("-", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <div>{b.completed.toLocaleString()}</div>
                    <div className="text-[11px] text-muted-foreground">/{b.totalRecipients.toLocaleString()}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{b.booked.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatPct(bookedPct)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {formatUsd(b.costUsd, { precise: true })}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-foreground">
                    {formatUsd(b.recoveredRevenueUsd)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatusPie({
  total,
  completed,
  booked,
  failed,
}: {
  total: number;
  completed: number;
  booked: number;
  failed: number;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const bookedPct = total ? booked / total : 0;
  const failedPct = total ? failed / total : 0;
  const otherDone = total ? Math.max(0, (completed - booked - failed) / total) : 0;
  const bookedLen = bookedPct * c;
  const failedLen = failedPct * c;
  const otherLen = otherDone * c;
  let offset = 0;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-label={`${completed}/${total} complete`}>
      <circle cx="12" cy="12" r={r} className="fill-none stroke-muted" strokeWidth="3" />
      {[
        { len: bookedLen, color: "stroke-emerald-500" },
        { len: failedLen, color: "stroke-destructive" },
        { len: otherLen, color: "stroke-primary" },
      ].map((seg, i) => {
        if (seg.len <= 0) return null;
        const dasharray = `${seg.len.toFixed(2)} ${(c - seg.len).toFixed(2)}`;
        const dashoffset = (-offset).toFixed(2);
        offset += seg.len;
        return (
          <circle
            key={i}
            cx="12"
            cy="12"
            r={r}
            className={`fill-none ${seg.color}`}
            strokeWidth="3"
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            transform="rotate(-90 12 12)"
          />
        );
      })}
    </svg>
  );
}
