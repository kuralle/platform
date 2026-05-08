import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { VoicePreviewChip } from "@kuralle/ui/components/voice-preview-chip";
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
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { formatPct, formatRelative, formatUsd } from "@/lib/format";
import { useAgents } from "@/hooks/api/agents";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import type { Agent } from "@/types/domain";

export const Route = createFileRoute("/_app/agents/")({
  component: AgentsListRoute,
});

function AgentsListRoute() {
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const { data: agentsList } = useAgents({ workspaceId });
  const data = useMemo(() => (agentsList?.items ?? []) as unknown as Agent[], [agentsList?.items]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "calls7d", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<Agent>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Name" />,
      meta: { label: "Name", variant: "text", placeholder: "Search by name or model" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-[14px] font-medium">{row.original.name}</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {row.original.id}
          </span>
        </div>
      ),
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.name.toLowerCase().includes(q) ||
          row.original.id.toLowerCase().includes(q) ||
          row.original.llmModel.toLowerCase().includes(q)
        );
      },
    },
    {
      accessorKey: "llmProvider",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Provider · model" />,
      meta: {
        label: "Provider",
        variant: "multiSelect",
        options: [
          { label: "OpenAI", value: "openai" },
          { label: "Anthropic", value: "anthropic" },
          { label: "Google", value: "google" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.llmProvider);
      },
      cell: ({ row }) => (
        <div>
          <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wide">
            {row.original.llmProvider}
          </Badge>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {row.original.llmModel}
          </div>
        </div>
      ),
    },
    {
      id: "voice",
      header: "Voice",
      enableSorting: false,
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()}>
          <VoicePreviewChip
            voiceId={row.original.voiceId}
            voiceName={row.original.voiceName}
            language={row.original.language}
          />
        </span>
      ),
    },
    {
      accessorKey: "calls7d",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Calls 7d" className="justify-end" />,
      meta: { label: "Calls 7d" },
      cell: ({ row }) => <div className="text-right font-mono tabular-nums">{row.original.calls7d}</div>,
    },
    {
      accessorKey: "bookingRate",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Booking rate" className="justify-end" />,
      meta: { label: "Booking rate" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">{formatPct(row.original.bookingRate)}</div>
      ),
    },
    {
      accessorKey: "costPerCall",
      header: ({ column }) => <DataTableColumnHeader column={column} label="$ / call" className="justify-end" />,
      meta: { label: "$ / call" },
      cell: ({ row }) => (
        <div className="text-right font-mono tabular-nums">
          {formatUsd(row.original.costPerCall, { precise: true })}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
      meta: {
        label: "Status",
        variant: "multiSelect",
        options: [
          { label: "Live", value: "live" },
          { label: "Paused", value: "paused" },
          { label: "Draft", value: "draft" },
          { label: "Archived", value: "archived" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.status);
      },
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <StatusPill tone={s === "live" ? "success" : s === "draft" ? "neutral" : "warning"}>
            {s}
          </StatusPill>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Updated" className="justify-end" />,
      meta: { label: "Updated" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {formatRelative(row.original.updatedAt)}
        </div>
      ),
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
  });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Configure"
        title="Agents"
        description="Every agent is a prompt + voice + compliance contract. Click in to tune behaviour, model, or eval criteria."
        actions={
          <Button nativeButton={false} render={<Link to="/agents/$agentId/behavior" params={{ agentId: "ag_a00" }} />}>
            <Plus size={16} /> New agent
          </Button>
        }
      />
      <DataTable
        table={table}
        onRowClick={(a) => navigate({ to: "/agents/$agentId/behavior", params: { agentId: a.id } })}
      >
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  );
}
