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

import { useConversations } from "@/hooks/api/conversations";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { EmptyState } from "@/components/empty-state";
import { formatRelative, formatUsd } from "@/lib/format";

/** API row shape for conversations.list. */
interface ConversationRow {
  id: string;
  agentId: string | null;
  participantName: string | null;
  participantId: string | null;
  outcome: string | null;
  durationSec: number | null;
  costUsd: number | null;
  startedAt: Date;
  endedAt: Date | null;
  direction: string | null;
}

export const Route = createFileRoute("/_app/conversations/")({
  component: ConversationsList,
});

function ConversationsList() {
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const conversationsQuery = useConversations({ workspaceId, limit: 100 });
  const data = useMemo(() => (conversationsQuery.data?.items ?? []) as ConversationRow[], [conversationsQuery.data?.items]);
  const isLoading = conversationsQuery.isLoading;
  const [sorting, setSorting] = useState<SortingState>([{ id: "startedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<ConversationRow>[]>(() => [
    {
      accessorKey: "id",
      header: ({ column }) => <DataTableColumnHeader column={column} label="ID" />,
      meta: { label: "Search", variant: "text", placeholder: "Search by ID, caller, or agent" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.id.toLowerCase().includes(q) ||
          (row.original.participantId ?? "").toLowerCase().includes(q) ||
          (row.original.participantName ?? "").toLowerCase().includes(q) ||
          (row.original.agentId ?? "").toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          {!row.original.endedAt && <LiveDot size={6} tone="live" />}
          {row.original.id}
        </div>
      ),
    },
    {
      id: "agent",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Agent" />,
      accessorFn: (r) => r.agentId ?? "",
      cell: ({ row }) => row.original.agentId ?? "—",
    },
    {
      id: "caller",
      accessorFn: (r) => r.participantName ?? r.participantId ?? "",
      header: "Caller",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-[12px] tabular-nums">{row.original.participantId ?? "—"}</span>
          {row.original.participantName && (
            <span className="text-[11px] text-muted-foreground">{row.original.participantName}</span>
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
        const isLive = !row.original.endedAt;
        return isLive || arr.includes(row.original.outcome ?? "");
      },
      cell: ({ row }) =>
        !row.original.endedAt ? (
          <StatusPill tone="live">Live · {row.original.direction ?? "inbound"}</StatusPill>
        ) : (
          <StatusPill tone={outcomeTone(row.original.outcome ?? "")}>{row.original.outcome ?? "—"}</StatusPill>
        ),
    },
    {
      id: "isLive",
      header: "",
      enableHiding: false,
      accessorFn: (r) => (r.endedAt == null ? "true" : "false"),
      meta: {
        label: "Live",
        variant: "select",
        options: [{ label: "Live now", value: "true" }],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return row.original.endedAt == null;
      },
      cell: () => null,
    },
    {
      accessorKey: "durationSec",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Duration" className="justify-end" />,
      meta: { label: "Duration" },
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {row.original.durationSec != null
            ? `${Math.floor(row.original.durationSec / 60)}:${String(row.original.durationSec % 60).padStart(2, "0")}`
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "costUsd",
      header: ({ column }) => <DataTableColumnHeader column={column} label="$ / call" className="justify-end" />,
      meta: { label: "$ / call" },
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {row.original.costUsd != null ? formatUsd(row.original.costUsd, { precise: true }) : "—"}
        </div>
      ),
    },
    {
      accessorKey: "startedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Started" className="justify-end" />,
      meta: { label: "Started" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {formatRelative(typeof row.original.startedAt === "string" ? row.original.startedAt : row.original.startedAt.toISOString())}
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
      {!isLoading && data.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="When your agent takes its first call, the transcript appears here."
          primaryAction={{ label: "Set up your first agent", to: "/agents" }}
        />
      ) : (
      <DataTable
        table={table}
        onRowClick={(c) =>
          navigate({
            to: c.endedAt == null ? "/conversations/$id/live" : "/conversations/$id",
            params: { id: c.id },
          })
        }
      >
        <DataTableToolbar table={table} />
      </DataTable>
      )}
    </div>
  );
}

function outcomeTone(outcome: string): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "booked" || outcome === "qualified") return "success";
  if (outcome === "voicemail" || outcome === "abandoned") return "warning";
  if (outcome === "missed" || outcome === "escalated") return "danger";
  return "neutral";
}
