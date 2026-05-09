import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
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
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { File, Globe, Plus, Trash2, Type } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { AttachDocumentModal, type KbAttachCandidate } from "@/components/modals/attach-document-modal";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useAgent } from "@/hooks/api/agents";
import { useAttachKbDocument, useDetachKbDocument, useKbAttached } from "@/hooks/api/kb";
import { formatBytes, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/agents/$agentId/knowledge")({
  component: KnowledgeTab,
});

const SOURCE_ICON = { file: File, url: Globe, text: Type } as const;

function sourceVisual(source: string): keyof typeof SOURCE_ICON {
  const s = source.toLowerCase();
  if (s.includes("url") || s === "url") return "url";
  if (s === "text") return "text";
  return "file";
}

function shellStatus(s: string | undefined): "live" | "paused" | "draft" {
  if (s === "live" || s === "paused" || s === "draft") return s;
  return "draft";
}

type KbRow = {
  id: string;
  name: string;
  source: string;
  folder: string | null;
  sizeBytes: number;
  status: string;
  updatedAt: Date | null;
};

function KnowledgeTab() {
  const { agentId } = Route.useParams();
  const workspaceId = useActiveWorkspaceId();
  const navigate = useNavigate();
  const agentQuery = useAgent({ workspaceId, agentId });
  const attachedQuery = useKbAttached({ workspaceId, agentId });
  const attachMut = useAttachKbDocument();
  const detachMut = useDetachKbDocument();

  const attached: KbRow[] = useMemo(
    () =>
      (attachedQuery.data?.items ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        source: d.source,
        folder: d.folder,
        sizeBytes: d.sizeBytes,
        status: d.status,
        updatedAt: d.updatedAt,
      })),
    [attachedQuery.data?.items],
  );

  const [attachOpen, setAttachOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const attachedSet = useMemo(() => new Set(attached.map((d) => d.id)), [attached]);

  async function attachDocs(docs: KbAttachCandidate[]) {
    for (const d of docs) {
      await attachMut.mutateAsync({
        workspaceId,
        agentId,
        docId: d.id,
      });
    }
  }

  function detach(docId: string) {
    void detachMut.mutateAsync({ workspaceId, agentId, docId });
  }

  const columns = useMemo<ColumnDef<KbRow>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Document" />,
      meta: { label: "Document", variant: "text", placeholder: "Search attached docs" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.name.toLowerCase().includes(q) ||
          (row.original.folder ?? "").toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => {
        const Icon = SOURCE_ICON[sourceVisual(row.original.source)];
        return (
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md border bg-muted text-muted-foreground">
              <Icon size={14} />
            </span>
            <div className="flex min-w-0 flex-col">
              <Link
                to="/knowledge/$docId"
                params={{ docId: row.original.id }}
                onClick={(e) => e.stopPropagation()}
                className="truncate text-[13px] font-medium hover:underline-offset-2 hover:underline"
              >
                {row.original.name}
              </Link>
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
        return arr.some((v) => row.original.source.toLowerCase().includes(v));
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
          {formatBytes(row.original.sizeBytes)}
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
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Updated" className="justify-end" />,
      meta: { label: "Updated" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {formatRelative(
            row.original.updatedAt
              ? typeof row.original.updatedAt === "string"
                ? row.original.updatedAt
                : row.original.updatedAt.toISOString()
              : null,
          )}
        </div>
      ),
      sortingFn: (a, b) => {
        const ta = a.original.updatedAt ? new Date(a.original.updatedAt).getTime() : 0;
        const tb = b.original.updatedAt ? new Date(b.original.updatedAt).getTime() : 0;
        return ta - tb;
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive"
            aria-label="Detach"
            onClick={() => detach(row.original.id)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: attached,
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

  const agentData = agentQuery.data;
  const agentName = (() => {
    const snap = agentData?.activeVersion?.snapshot;
    if (snap && typeof snap === "object" && snap !== null && "name" in snap) {
      const n = (snap as { name?: string }).name?.trim();
      if (n) return n;
    }
    return agentData?.agent?.id ?? agentId;
  })();
  const rawStatus = agentData?.agent?.status === "archived" ? "draft" : agentData?.agent?.status;
  const agentStatus = shellStatus(rawStatus);

  return (
    <AgentEditorShell
      agentId={agentId}
      agentName={agentName}
      status={agentStatus}
      changes={0}
      onSave={() => undefined}
      onDiscard={() => undefined}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow>Knowledge</Eyebrow>
            <h2 className="mt-1 font-display text-[20px] font-semibold tracking-tight">Attached documents</h2>
            <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
              The agent grounds its answers on these workspace documents. Manage the source, RAG index, and metadata
              from the document detail page — every other agent that attaches the same doc inherits those changes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to="/knowledge" />}>
              Open knowledge base →
            </Button>
            <Button onClick={() => setAttachOpen(true)} disabled={attachMut.isPending}>
              <Plus size={16} /> Attach from KB
            </Button>
          </div>
        </div>

        <DataTable
          table={table}
          onRowClick={(d) => navigate({ to: "/knowledge/$docId", params: { docId: d.id } })}
        >
          <DataTableToolbar table={table} />
        </DataTable>
      </div>

      <AttachDocumentModal
        workspaceId={workspaceId}
        open={attachOpen}
        onOpenChange={setAttachOpen}
        alreadyAttached={attachedSet}
        onAttach={(docs) => void attachDocs(docs)}
      />
    </AgentEditorShell>
  );
}
