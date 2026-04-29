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
import { makeAgents, makePhoneNumbers } from "@/mocks";
import type { PhoneNumber } from "@/types/domain";

export const Route = createFileRoute("/_app/phone-numbers")({
  component: PhoneNumbersRoute,
});

function PhoneNumbersRoute() {
  const [importOpen, setImportOpen] = useState(false);
  const numbers = useMemo(() => makePhoneNumbers(8), []);
  const agentsById = useMemo(() => {
    const map = new Map<string, string>();
    makeAgents(10).forEach((a) => map.set(a.id, a.name));
    return map;
  }, []);
  const [recording, setRecording] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(numbers.map((n) => [n.id, n.recording])),
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<PhoneNumber>[]>(() => [
    {
      accessorKey: "number",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Number" />,
      meta: { label: "Number", variant: "text", placeholder: "Search by number" },
      cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.number}</span>,
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return row.original.number.toLowerCase().includes(q);
      },
    },
    {
      accessorKey: "provider",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Provider" />,
      meta: {
        label: "Provider",
        variant: "multiSelect",
        options: [
          { label: "Twilio Native", value: "twilio-native" },
          { label: "Twilio BYO", value: "twilio-byo" },
          { label: "SIP", value: "sip" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.provider);
      },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {row.original.provider.replace("twilio-", "Twilio ")}
        </Badge>
      ),
    },
    {
      accessorKey: "region",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Region" />,
      meta: { label: "Region" },
      cell: ({ row }) => <span className="text-[12px] text-muted-foreground">{row.original.region}</span>,
    },
    {
      id: "agent",
      accessorFn: (n) => (n.attachedAgentId ? agentsById.get(n.attachedAgentId) ?? "" : ""),
      header: "Attached agent",
      cell: ({ row }) =>
        row.original.attachedAgentId ? (
          <span className="text-[13px]">{agentsById.get(row.original.attachedAgentId)}</span>
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
