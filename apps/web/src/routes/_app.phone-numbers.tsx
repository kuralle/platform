import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { Switch } from "@kuralle/ui/components/switch";
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
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ImportNumberWizard } from "@/components/modals/import-number-wizard";
import { usePhoneNumbers } from "@/hooks/api/phone-numbers";
import { useAgents } from "@/hooks/api/agents";
import { useActiveWorkspaceId } from "@/contexts/workspace";

/** API row shape for channels.list (phone number endpoints). */
interface PhoneNumberRow {
  id: string;
  channelKind: string;
  identifier: string;
  displayName: string | null;
  attachedAgentId: string | null;
  metadata: unknown;
}

export const Route = createFileRoute("/_app/phone-numbers")({
  component: PhoneNumbersRoute,
});

function PhoneNumbersRoute() {
  const [importOpen, setImportOpen] = useState(false);
  const workspaceId = useActiveWorkspaceId();
  const pnQuery = usePhoneNumbers({ workspaceId });
  const agentsQuery = useAgents({ workspaceId, limit: 100 });
  const numbers = useMemo(() => (pnQuery.data?.items ?? []) as PhoneNumberRow[], [pnQuery.data?.items]);
  const agentsById = useMemo(() => {
    const map = new Map<string, string>();
    (agentsQuery.data?.items ?? []).forEach((a) => map.set(a.id, a.id));
    return map;
  }, [agentsQuery.data?.items]);
  const [recording, setRecording] = useState<Record<string, boolean>>({});

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<PhoneNumberRow>[]>(() => [
    {
      accessorKey: "identifier",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Number" />,
      meta: { label: "Number", variant: "text", placeholder: "Search by number" },
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.identifier}</span>,
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return row.original.identifier.toLowerCase().includes(q);
      },
    },
    {
      accessorKey: "channelKind",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Type" />,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {row.original.channelKind}
        </Badge>
      ),
    },
    {
      id: "agent",
      accessorFn: (n) => (n.attachedAgentId ? agentsById.get(n.attachedAgentId) ?? "" : ""),
      header: "Attached agent",
      cell: ({ row }) =>
        row.original.attachedAgentId ? (
          <span className="text-[13px]">{agentsById.get(row.original.attachedAgentId) ?? row.original.attachedAgentId}</span>
        ) : (
          <span className="text-[13px] text-muted-foreground italic">Not attached</span>
        ),
    },
    {
      id: "recording",
      header: () => <div className="text-right">Recording</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Switch
            checked={recording[row.original.id] ?? false}
            onCheckedChange={(c) => setRecording((r) => ({ ...r, [row.original.id]: c }))}
          />
        </div>
      ),
    },
    {
      id: "status",
      header: () => <div className="text-right">Status</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <StatusPill tone={row.original.attachedAgentId ? "success" : "neutral"}>
            {row.original.attachedAgentId ? "Live" : "Detached"}
          </StatusPill>
        </div>
      ),
    },
  ], [agentsById, recording]);

  const table = useReactTable({
    data: numbers,
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
        eyebrow="Distribute"
        title="Phone numbers"
        description="Numbers attached to this workspace. Each number routes to one agent at a time."
        actions={
          <Button onClick={() => setImportOpen(true)}>
            <Plus size={16} /> Import number
          </Button>
        }
      />
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <ImportNumberWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
