import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { DataTable } from "@kuralle/ui/components/data-table";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Skeleton } from "@kuralle/ui/components/skeleton";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { useMemo } from "react";

import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useMonthlyReceipt } from "@/hooks/api/receipts";
import { formatUsd } from "@/lib/format";

export const Route = createFileRoute("/_app/revenue/receipt/$month")({
  component: RoiReceiptRoute,
});

function parseMonthSlug(slug: string): { year: number; month: number } {
  const [y, m] = slug.split("-").map(Number);
  return { year: y ?? 2026, month: m ?? 4 };
}

function RoiReceiptRoute() {
  const { month: monthSlug } = Route.useParams();
  const workspaceId = useActiveWorkspaceId();
  const { year, month } = parseMonthSlug(monthSlug);
  const { data: report, isLoading, isError } = useMonthlyReceipt({ workspaceId, year, month });

  const byAgent = report?.byAgent ?? [];
  const totalCost = report?.totalCostUsd ?? 0;
  const totalCalls = report?.totalCalls ?? 0;
  const maxCost = Math.max(...byAgent.map((a) => a.totalCostUsd), 1);

  type Row = (typeof byAgent)[number];
  const perAgentColumns = useMemo<ColumnDef<Row>[]>(() => [
    {
      accessorKey: "agentId",
      header: "Source",
      cell: ({ row }) => (
        <div>
          <div className="text-[13px] font-medium">{row.original.agentId}</div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-foreground"
              style={{ width: `${(row.original.totalCostUsd / maxCost) * 100}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      accessorKey: "count",
      header: () => <div className="text-right">Calls</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{row.original.count}</div>
      ),
    },
    {
      accessorKey: "totalCostUsd",
      header: () => <div className="text-right">Cost</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{formatUsd(row.original.totalCostUsd)}</div>
      ),
    },
  ], [maxCost]);

  const perAgentTable = useReactTable({
    data: byAgent,
    columns: perAgentColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  function print() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[920px] px-8 py-8">
        <Skeleton className="h-[800px]" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="mx-auto max-w-[920px] px-8 py-8">
        <Alert variant="destructive">
          <AlertTitle>Failed to load monthly receipt</AlertTitle>
          <AlertDescription>No usage data found for {monthSlug}.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-3.5rem)] bg-muted/60 print:bg-card">
      <div className="mx-auto max-w-[920px] px-8 py-8 print:p-0">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link to="/home" search={{ welcome: false, firstrun: false }} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
            <ChevronLeft size={12} /> Back to home
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={print} className="gap-1.5">
              <Printer size={14} /> Print
            </Button>
            <Button className="gap-1.5">
              <Download size={14} /> Download PDF
            </Button>
          </div>
        </div>

        <article
          className="mx-auto bg-card p-12 shadow-[0_24px_64px_rgba(11,18,32,0.06)] print:shadow-none"
          style={{ aspectRatio: "794 / 1123", maxHeight: 1123 }}
        >
          <header className="flex items-start justify-between border-b pb-6">
            <div>
              <Eyebrow>Monthly usage report · {monthSlug}</Eyebrow>
              <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">
                Usage Summary
              </h1>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Voice agent operations summary · prepared by Kuralle.
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-[11px] tabular-nums text-muted-foreground">workspace · {workspaceId}</div>
            </div>
          </header>

          <section className="mt-8 rounded-md bg-amber-50 px-8 py-10 text-center">
            <Eyebrow>Total cost · {monthSlug}</Eyebrow>
            <div className="mt-3 font-mono text-[64px] font-medium leading-none tracking-tight text-foreground tabular-nums">
              {formatUsd(totalCost)}
            </div>
            <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-foreground/30 bg-card px-4 py-1.5 font-mono text-[13px] tabular-nums text-foreground">
              {totalCalls.toLocaleString()} calls
            </div>
          </section>

          <section className="mt-10 grid gap-3">
            <Eyebrow>By agent</Eyebrow>
            <DataTable table={perAgentTable} hidePagination />
          </section>

          <section className="mt-8 grid grid-cols-2 gap-4">
            {report.byKind.map((k) => (
              <Card key={k.kind} className="p-4">
                <Eyebrow>{k.kind}</Eyebrow>
                <div className="mt-1 font-mono text-[20px] tabular-nums text-foreground">
                  {k.count} calls · {formatUsd(k.totalCostUsd)}
                </div>
              </Card>
            ))}
          </section>

          <footer className="mt-10 border-t pt-4 text-[10px] text-muted-foreground">
            Prepared by Kuralle. Usage report for {monthSlug}.
          </footer>
        </article>
      </div>
    </div>
  );
}
