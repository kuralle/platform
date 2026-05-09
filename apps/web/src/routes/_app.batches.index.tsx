import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { PageHeader } from "@kuralle/ui/components/page-header";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { useBatches } from "@/hooks/api/batches";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { EmptyState } from "@/components/empty-state";
import { formatPct, formatUsd } from "@/lib/format";

export const Route = createFileRoute("/_app/batches/")({
  component: BatchesListRoute,
});

interface BatchRow {
  id: string;
  name: string;
  agentId: string | null;
  channelKind: string;
  vertical: string;
  status: string;
  totalRecipients: number;
  completed: number | null;
  booked: number | null;
  failed: number | null;
  costUsd: number | null;
  recoveredRevenueUsd: number | null;
}

function BatchesListRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data, isLoading } = useBatches({ workspaceId });
  const batches = useMemo(() => (data?.items ?? []) as unknown as BatchRow[], [data?.items]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<BatchRow>[]>(() => [
    {
      id: "pie",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <StatusPie
          total={row.original.totalRecipients}
          completed={row.original.completed ?? 0}
          booked={row.original.booked ?? 0}
          failed={row.original.failed ?? 0}
        />
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
      meta: { label: "Name", variant: "text", placeholder: "Search by batch name" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.name.toLowerCase().includes(q) ||
          row.original.id.toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => (
        <div>
          <div className="text-[13px] font-medium">{row.original.name}</div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.original.id}</div>
        </div>
      ),
    },
    {
      accessorKey: "channelKind",
      header: "Channel",
      cell: ({ row }) => <span className="text-[13px] text-muted-foreground">{row.original.channelKind}</span>,
    },
    {
      accessorKey: "vertical",
      header: "Vertical",
      meta: {
        label: "Vertical",
        variant: "multiSelect",
        options: [
          { label: "Home Services", value: "home-services" },
          { label: "Appointment Services", value: "appointment-services" },
          { label: "Education", value: "education" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.vertical);
      },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {row.original.vertical.replace("-", " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
      meta: {
        label: "Status",
        variant: "multiSelect",
        options: [
          { label: "Running", value: "running" },
          { label: "Completed", value: "completed" },
          { label: "Scheduled", value: "scheduled" },
          { label: "Paused", value: "paused" },
          { label: "Failed", value: "failed" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.status);
      },
    },
    {
      accessorKey: "totalRecipients",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Recipients" className="justify-end" />,
      meta: { label: "Recipients" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          <div>{(row.original.completed ?? 0).toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground">/{row.original.totalRecipients.toLocaleString()}</div>
        </div>
      ),
    },
    {
      accessorKey: "booked",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Booked" className="justify-end" />,
      meta: { label: "Booked" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{(row.original.booked ?? 0).toLocaleString()}</div>
      ),
    },
    {
      id: "bookingPct",
      accessorFn: (b) => (b.completed ? (b.booked ?? 0) / b.completed : 0),
      header: ({ column }) => <DataTableColumnHeader column={column} label="Booking %" className="justify-end" />,
      meta: { label: "Booking %" },
      cell: ({ row }) => {
        const completed = row.original.completed ?? 0;
        const pct = completed ? (row.original.booked ?? 0) / completed : 0;
        return <div className="text-right font-mono tabular-nums">{formatPct(pct)}</div>;
      },
    },
    {
      accessorKey: "costUsd",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Cost" className="justify-end" />,
      meta: { label: "Cost" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{formatUsd(row.original.costUsd ?? 0, { precise: true })}</div>
      ),
    },
    {
      accessorKey: "recoveredRevenueUsd",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Recovered $" className="justify-end" />,
      meta: { label: "Recovered $" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{formatUsd(row.original.recoveredRevenueUsd ?? 0)}</div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: batches,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        <PageHeader eyebrow="Operate" title="Outbound batches" description="Loading…" />
      </div>
    );
  }

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
      {!isLoading && batches.length === 0 ? (
        <EmptyState
          title="No batches yet"
          description="Send WhatsApp re-engagement, voice reminders, or SMS in bulk."
          primaryAction={{ label: "+ New batch", to: "/batches/new" }}
        />
      ) : (
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      )}
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
