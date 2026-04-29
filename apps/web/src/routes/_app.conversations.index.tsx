import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { formatRelative, formatUsd } from "@/lib/format";
import { makeConversations } from "@/mocks";
import type { Conversation } from "@/types/domain";

export const Route = createFileRoute("/_app/conversations/")({
  component: ConversationsList,
});

function ConversationsList() {
  const navigate = useNavigate();
  const data = useMemo(() => makeConversations(24), []);
  const [sorting, setSorting] = useState<SortingState>([{ id: "startedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<Conversation>[]>(() => [
    {
      accessorKey: "id",
      header: ({ column }) => <DataTableColumnHeader column={column} label="ID" />,
      meta: { label: "Search", variant: "text", placeholder: "Search by ID, caller, or agent" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.id.toLowerCase().includes(q) ||
          row.original.callerId.toLowerCase().includes(q) ||
          row.original.agentName.toLowerCase().includes(q) ||
          (row.original.callerName ?? "").toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          {row.original.isLive && <LiveDot size={6} tone="live" />}
          {row.original.id}
        </div>
      ),
    },
    {
      accessorKey: "agentName",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Agent" />,
      meta: {
        label: "Agent",
        variant: "multiSelect",
        options: [
          { label: "Calderon HVAC Inbound", value: "Calderon HVAC Inbound" },
          { label: "Sundance Plumbing 24/7", value: "Sundance Plumbing 24/7" },
          { label: "Brookline Dental Reminder", value: "Brookline Dental Reminder" },
          { label: "Beacon University Admissions", value: "Beacon University Admissions" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.agentName);
      },
    },
    {
      id: "caller",
      accessorFn: (r) => r.callerName ?? r.callerId,
      header: "Caller",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-[12px] tabular-nums">{row.original.callerId}</span>
          {row.original.callerName && (
            <span className="text-[11px] text-muted-foreground">{row.original.callerName}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "outcome",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Outcome" />,
      meta: {
        label: "Outcome",
        variant: "multiSelect",
        options: [
          { label: "Booked", value: "booked" },
          { label: "Qualified", value: "qualified" },
          { label: "Missed", value: "missed" },
          { label: "Voicemail", value: "voicemail" },
          { label: "Abandoned", value: "abandoned" },
          { label: "Escalated", value: "escalated" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return row.original.isLive || arr.includes(row.original.outcome);
      },
      cell: ({ row }) =>
        row.original.isLive ? (
          <StatusPill tone="live">Live · {row.original.direction}</StatusPill>
        ) : (
          <StatusPill tone={outcomeTone(row.original.outcome)}>{row.original.outcome}</StatusPill>
        ),
    },
    {
      accessorKey: "isLive",
      header: "",
      enableHiding: false,
      meta: {
        label: "Live",
        variant: "select",
        options: [{ label: "Live now", value: "true" }],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(String(row.original.isLive));
      },
      cell: () => null,
    },
    {
      accessorKey: "durationSec",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Duration" className="justify-end" />,
      meta: { label: "Duration" },
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {Math.floor(row.original.durationSec / 60)}:{String(row.original.durationSec % 60).padStart(2, "0")}
        </div>
      ),
    },
    {
      accessorKey: "costUsd",
      header: ({ column }) => <DataTableColumnHeader column={column} label="$ / call" className="justify-end" />,
      meta: { label: "$ / call" },
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {formatUsd(row.original.costUsd, { precise: true })}
        </div>
      ),
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Started" className="justify-end" />,
      meta: { label: "Started" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {formatRelative(row.original.startedAt)}
        </div>
      ),
      sortingFn: (a, b) => new Date(a.original.startedAt).getTime() - new Date(b.original.startedAt).getTime(),
    },
  ], []);

  const table = useReactTable({
    data,
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
    initialState: {
      columnVisibility: { isLive: false }, // hidden column; filter only via toolbar
    },
  });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Operate"
        title="Conversations"
        description="Filter, search, and drill into any call. The toolbar below carries every filter that used to live in the old left rail."
      />
      <DataTable
        table={table}
        onRowClick={(c) =>
          navigate({
            to: c.isLive ? "/conversations/$id/live" : "/conversations/$id",
            params: { id: c.id },
          })
        }
      >
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  );
}

function outcomeTone(outcome: string): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "booked" || outcome === "qualified") return "success";
  if (outcome === "voicemail" || outcome === "abandoned") return "warning";
  if (outcome === "missed" || outcome === "escalated") return "danger";
  return "neutral";
}
