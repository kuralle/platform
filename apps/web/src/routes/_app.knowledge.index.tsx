import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
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
import { File, Globe, Plus, Type } from "lucide-react";
import { useMemo, useState } from "react";

import { AddDocumentModal } from "@/components/modals/add-document-modal";
import { useKb } from "@/hooks/api/kb";
import { useWorkspace } from "@/contexts/workspace";
import { formatRelative } from "@/lib/format";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** API row shape for kb.list. */
interface KbDocumentRow {
  id: string;
  name: string;
  source: string;
  folder: string | null;
  status: string;
  sizeBytes: number;
  updatedAt: Date | null;
}

export const Route = createFileRoute("/_app/knowledge/")({
  component: KnowledgeListRoute,
});

const SOURCE_ICON = { file: File, url: Globe, text: Type } as const;

function KnowledgeListRoute() {
  const navigate = useNavigate();
  const { workspace } = useWorkspace();
  const kbQuery = useKb({ workspaceId: workspace.id, limit: 100 });
  const data = useMemo(() => (kbQuery.data?.items ?? []) as KbDocumentRow[], [kbQuery.data?.items]);
  const [addOpen, setAddOpen] = useState(false);

  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<KbDocumentRow>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Document" />,
      meta: { label: "Document", variant: "text", placeholder: "Search KB" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.name.toLowerCase().includes(q) ||
          (row.original.folder ?? "").toLowerCase().includes(q) ||
          row.original.id.toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => {
        const Icon = SOURCE_ICON[row.original.source as keyof typeof SOURCE_ICON] ?? File;
        return (
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md border bg-muted text-muted-foreground">
              <Icon size={14} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium">{row.original.name}</span>
              <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                {row.original.id} · {row.original.folder ?? "—"}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "source",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Source" />,
      meta: {
        label: "Source",
        variant: "multiSelect",
        options: [
          { label: "File", value: "file" },
          { label: "URL", value: "url" },
          { label: "Text", value: "text" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.source);
      },
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {row.original.source}
        </Badge>
      ),
    },
    {
      accessorKey: "sizeBytes",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Size" className="justify-end" />,
      meta: { label: "Size" },
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {row.original.sizeBytes < 1024
            ? `${row.original.sizeBytes} B`
            : row.original.sizeBytes < 1024 * 1024
              ? `${(row.original.sizeBytes / 1024).toFixed(1)} KB`
              : `${(row.original.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
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
          { label: "Ready", value: "ready" },
          { label: "Indexing", value: "indexing" },
          { label: "Needs refresh", value: "needs_refresh" },
          { label: "Failed", value: "failed" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.status);
      },
      cell: ({ row }) => (
        <StatusPill
          tone={
            row.original.status === "ready"
              ? "success"
              : row.original.status === "indexing"
                ? "info"
                : row.original.status === "needs_refresh"
                  ? "warning"
                  : "danger"
          }
        >
          {row.original.status.replace("_", " ")}
        </StatusPill>
      ),
    },
    {
      id: "agents",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Agents" className="justify-end" />,
      meta: { label: "Agents" },
      cell: () => <div className="text-right font-mono text-[12px] tabular-nums">—</div>,
    },
    {
      accessorKey: "folder",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Folder" />,
      cell: ({ row }) => row.original.folder ?? "—",
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Updated" className="justify-end" />,
      meta: { label: "Updated" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {row.original.updatedAt
            ? formatRelative(typeof row.original.updatedAt === "string" ? row.original.updatedAt : row.original.updatedAt.toISOString())
            : "—"}
        </div>
      ),
      sortingFn: (a, b) => new Date(a.original.updatedAt ?? 0).getTime() - new Date(b.original.updatedAt ?? 0).getTime(),
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

  const totalSize = data.reduce((s, d) => s + d.sizeBytes, 0);
  const totalChars = data.reduce(
    (s, d) => s + (d.source === "text" ? d.sizeBytes : Math.floor(d.sizeBytes / 4)),
    0,
  );
  const charCap = 300_000;

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Configure"
        title="Knowledge base"
        description="Workspace-shared documents. Attach any of these to one or many agents — agents reference, never own, the doc."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add document
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={data.length.toLocaleString()} />
        <Stat label="Total size" value={formatBytes(totalSize)} sub="across all sources" />
        <Stat
          label="Characters"
          value={`${totalChars.toLocaleString()} / ${charCap.toLocaleString()}`}
          sub="non-enterprise cap"
          warn={totalChars > charCap}
        />
      </div>
      <DataTable
        table={table}
        onRowClick={(d) => navigate({ to: "/knowledge/$docId", params: { docId: d.id } })}
      >
        <DataTableToolbar table={table} />
      </DataTable>
      <AddDocumentModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-[18px] tabular-nums ${warn ? "text-amber-500" : "text-foreground"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
