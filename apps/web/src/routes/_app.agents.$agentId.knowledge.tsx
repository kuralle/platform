import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { Slider } from "@kuralle/ui/components/slider";
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
import { File, Globe, Plus, RefreshCcw, Sparkles, Trash2, Type } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { AddDocumentModal } from "@/components/modals/add-document-modal";
import { formatRelative } from "@/lib/format";
import { formatBytes, makeAgents, makeKbDocuments } from "@/mocks";
import type { KbDocument } from "@/mocks/kb";

export const Route = createFileRoute("/_app/agents/$agentId/knowledge")({
  component: KnowledgeTab,
});

const SOURCE_ICON = {
  file: File,
  url: Globe,
  text: Type,
} as const;

function KnowledgeTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const documents = useMemo(() => makeKbDocuments(8), []);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [embeddingModel, setEmbeddingModel] = useState<"e5_mistral_7b_instruct" | "multilingual_e5_large_instruct">(
    "e5_mistral_7b_instruct",
  );
  const [maxVectorDistance, setMaxVectorDistance] = useState(0.65);
  const [addOpen, setAddOpen] = useState(false);

  const [original] = useState({ ragEnabled, embeddingModel, maxVectorDistance });
  const changes =
    (ragEnabled !== original.ragEnabled ? 1 : 0) +
    (embeddingModel !== original.embeddingModel ? 1 : 0) +
    (Math.abs(maxVectorDistance - original.maxVectorDistance) > 0.001 ? 1 : 0);

  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const totalChars = documents.reduce(
    (s, d) => s + (d.source === "text" ? d.sizeBytes : Math.floor(d.sizeBytes / 4)),
    0,
  );
  const charCap = 300_000;

  const columns = useMemo<ColumnDef<KbDocument>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Document" />,
      meta: { label: "Document", variant: "text", placeholder: "Search documents" },
      filterFn: (row, _id, value) => {
        const q = String(value ?? "").toLowerCase();
        if (!q) return true;
        return (
          row.original.name.toLowerCase().includes(q) ||
          row.original.folder.toLowerCase().includes(q)
        );
      },
      cell: ({ row }) => {
        const Icon = SOURCE_ICON[row.original.source];
        return (
          <div className="flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md border bg-muted text-muted-foreground">
              <Icon size={14} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium">{row.original.name}</span>
              <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                {row.original.id} · {row.original.folder}
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
          {formatBytes(row.original.sizeBytes)}
        </div>
      ),
    },
    {
      accessorKey: "usage",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Retrieval" />,
      meta: {
        label: "Retrieval",
        variant: "multiSelect",
        options: [
          { label: "Inline (prompt)", value: "prompt" },
          { label: "RAG (auto)", value: "auto" },
        ],
      },
      filterFn: (row, _id, value) => {
        const arr = value as string[] | undefined;
        if (!arr?.length) return true;
        return arr.includes(row.original.usage);
      },
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`text-[10px] uppercase tracking-wide ${
            row.original.usage === "auto" ? "border-primary/40 text-primary" : ""
          }`}
        >
          {row.original.usage === "auto" ? "RAG" : "Inline"}
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
      id: "dependents",
      accessorFn: (d) => d.dependentAgents.length,
      header: () => <div className="text-right">Other agents</div>,
      enableSorting: true,
      cell: ({ row }) =>
        row.original.dependentAgents.length === 0 ? (
          <div className="text-right text-[12px] text-muted-foreground">—</div>
        ) : (
          <div className="text-right text-[12px] text-muted-foreground">
            +{row.original.dependentAgents.length}
          </div>
        ),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <DataTableColumnHeader column={column} label="Updated" className="justify-end" />,
      meta: { label: "Updated" },
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">{formatRelative(row.original.updatedAt)}</div>
      ),
      sortingFn: (a, b) => new Date(a.original.updatedAt).getTime() - new Date(b.original.updatedAt).getTime(),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: () => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Refresh">
            <RefreshCcw size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 text-destructive" aria-label="Detach">
            <Trash2 size={13} />
          </Button>
        </div>
      ),
    },
  ], []);

  const table = useReactTable({
    data: documents,
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

  const overCap = totalChars > charCap;

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={() => {
        setRagEnabled(original.ragEnabled);
        setEmbeddingModel(original.embeddingModel);
        setMaxVectorDistance(original.maxVectorDistance);
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Eyebrow>Retrieval</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">RAG retrieval at conversation time</h2>
              <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
                When on, the agent retrieves matching chunks from indexed documents instead of stuffing every doc
                into the prompt. Adds ~250&nbsp;ms latency per turn but lets you scale beyond the prompt window.
              </p>
            </div>
            <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel>Embedding model</FieldLabel>
              <Select
                value={embeddingModel}
                onValueChange={(v) => setEmbeddingModel(v as typeof embeddingModel)}
                disabled={!ragEnabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="e5_mistral_7b_instruct">e5-mistral-7b-instruct (default)</SelectItem>
                  <SelectItem value="multilingual_e5_large_instruct">multilingual-e5-large-instruct</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Max vector distance · {maxVectorDistance.toFixed(2)}</FieldLabel>
              <Slider
                min={0.1}
                max={1}
                step={0.05}
                value={[maxVectorDistance]}
                onValueChange={([v]) => v !== undefined && setMaxVectorDistance(v)}
                disabled={!ragEnabled}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Lower → stricter match. Default 0.65 works well for English-language docs.
              </p>
            </Field>
          </div>
        </Card>

        {overCap && (
          <Alert variant="destructive" className="border-amber-500/30 bg-amber-500/8 text-foreground">
            <Sparkles />
            <AlertTitle>Workspace is over the non-enterprise KB cap.</AlertTitle>
            <AlertDescription>
              Total characters across all attached docs is {totalChars.toLocaleString()} — the cap is{" "}
              {charCap.toLocaleString()}. Detach unused docs or upgrade the plan to Enterprise.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <div className="flex items-end justify-between gap-3 pb-3">
            <div>
              <Eyebrow>Attached documents</Eyebrow>
              <div className="mt-1 font-display text-[18px] font-semibold">{documents.length} files · {formatBytes(documents.reduce((s, d) => s + d.sizeBytes, 0))}</div>
              <div className="mt-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">
                {totalChars.toLocaleString()} / {charCap.toLocaleString()} characters
              </div>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add document
            </Button>
          </div>
          <DataTable table={table}>
            <DataTableToolbar table={table} />
          </DataTable>
        </div>
      </div>
      <AddDocumentModal open={addOpen} onOpenChange={setAddOpen} />
    </AgentEditorShell>
  );
}
