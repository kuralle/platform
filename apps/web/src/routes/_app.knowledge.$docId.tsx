import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { Switch } from "@kuralle/ui/components/switch";
import { Textarea } from "@kuralle/ui/components/textarea";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Download,
  ExternalLink,
  File as FileIcon,
  Globe,
  RefreshCcw,
  ShieldAlert,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useDeleteKbDocument, useKbDocument, useUpdateKbDocument } from "@/hooks/api/kb";
import { formatBytes, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/knowledge/$docId")({
  component: KnowledgeDocRoute,
});

const SOURCE_ICON = { file: FileIcon, url: Globe, text: Type } as const;

function sourceVisual(source: string): keyof typeof SOURCE_ICON {
  const s = source.toLowerCase();
  if (s.includes("url") || s === "url") return "url";
  if (s === "text") return "text";
  return "file";
}

function KnowledgeDocRoute() {
  const navigate = useNavigate();
  const { docId } = Route.useParams();
  const workspaceId = useActiveWorkspaceId();
  const docQuery = useKbDocument({ workspaceId, docId });
  const updateMut = useUpdateKbDocument();
  const deleteMut = useDeleteKbDocument();

  const doc = docQuery.data;
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [content, setContent] = useState("");
  const [autoSync, setAutoSync] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setName(doc.name);
    setFolder(doc.folder ?? "");
    setContent(doc.contentText ?? "");
    setAutoSync(doc.autoSync);
  }, [doc]);

  const baseline = useMemo(
    () =>
      doc
        ? {
            name: doc.name,
            folder: doc.folder ?? "",
            content: doc.contentText ?? "",
            autoSync: doc.autoSync,
          }
        : null,
    [doc],
  );

  const changes = baseline
    ? (name !== baseline.name ? 1 : 0) +
      (folder !== baseline.folder ? 1 : 0) +
      (content !== baseline.content ? 1 : 0) +
      (autoSync !== baseline.autoSync ? 1 : 0)
    : 0;

  function reset() {
    if (!baseline) return;
    setName(baseline.name);
    setFolder(baseline.folder);
    setContent(baseline.content);
    setAutoSync(baseline.autoSync);
  }

  async function save() {
    if (!doc) return;
    await updateMut.mutateAsync({
      workspaceId,
      docId,
      name,
      folder: folder.trim() === "" ? null : folder,
      contentText: content,
      autoSync,
    });
  }

  async function remove() {
    await deleteMut.mutateAsync({ workspaceId, docId });
    void navigate({ to: "/knowledge" });
  }

  if (docQuery.isPending) {
    return (
      <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center text-muted-foreground">
        Loading document…
      </div>
    );
  }

  if (docQuery.isError || !doc) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-lg flex-col justify-center px-6 py-16">
        <EmptyState
          title="Document not found"
          description="It may have been deleted or you may not have access."
          primaryAction={{ label: "Back to knowledge base", to: "/knowledge" }}
        />
      </div>
    );
  }

  const Icon = SOURCE_ICON[sourceVisual(doc.source)];
  const isUrl = sourceVisual(doc.source) === "url";

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-6">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Link to="/knowledge" className="inline-flex items-center gap-1 hover:text-foreground">
              <ChevronLeft size={12} /> Knowledge base
            </Link>
            <span>/</span>
            <span className="font-mono tabular-nums text-foreground">{doc.id}</span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md border bg-muted text-muted-foreground">
                <Icon size={18} />
              </span>
              <div>
                <Eyebrow>Document · {doc.source}</Eyebrow>
                <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight">{name}</h1>
              </div>
              <StatusPill
                tone={
                  doc.status === "ready"
                    ? "success"
                    : doc.status === "indexing"
                      ? "info"
                      : doc.status === "needs_refresh"
                        ? "warning"
                        : "danger"
                }
              >
                {doc.status.replace("_", " ")}
              </StatusPill>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-1.5" type="button" disabled>
                <RefreshCcw size={14} /> Refresh
              </Button>
              <Button variant="outline" className="gap-1.5" type="button" disabled>
                <Download size={14} /> Download
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive"
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => void remove()}
              >
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-6">
              <Card className="p-6">
                <Eyebrow>Content</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">
                  {isUrl ? "Indexed URL" : doc.source === "text" ? "Inline body" : "Imported file content"}
                </h2>
                {isUrl ? (
                  <div className="mt-4 grid gap-3">
                    <Field>
                      <FieldLabel>Source URL</FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input value={doc.sourceUrl ?? ""} readOnly className="font-mono text-[13px]" />
                        <Button variant="outline" size="icon" aria-label="Open URL" nativeButton={false} render={<a href={doc.sourceUrl ?? "#"} target="_blank" rel="noopener noreferrer" />}>
                          <ExternalLink size={14} />
                        </Button>
                      </div>
                    </Field>
                    <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                      <div>
                        <div className="text-[13px] font-medium">Auto-sync</div>
                        <div className="text-[12px] text-muted-foreground">Re-fetch when the source changes.</div>
                      </div>
                      <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                    </label>
                  </div>
                ) : null}
                <Field className="mt-4">
                  <FieldLabel htmlFor="content">Content</FieldLabel>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[320px] font-mono text-[12px]"
                  />
                </Field>
              </Card>

              {doc.status === "needs_refresh" && (
                <Alert variant="destructive" className="border-amber-500/30 bg-amber-500/8 text-foreground">
                  <ShieldAlert />
                  <AlertTitle>Source changed since last sync.</AlertTitle>
                  <AlertDescription>
                    Click <strong>Refresh</strong> to re-fetch the source. Agents using this doc will see the new
                    content on their next turn.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="grid gap-6">
              <Card className="p-5">
                <Eyebrow>Metadata</Eyebrow>
                <div className="mt-3 grid gap-3">
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="folder">Folder</FieldLabel>
                    <Input id="folder" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="e.g. Pricing" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <MetaRow label="Size" value={formatBytes(doc.sizeBytes)} />
                    <MetaRow
                      label="Updated"
                      value={formatRelative(doc.updatedAt ? doc.updatedAt.toISOString() : null)}
                    />
                    <MetaRow label="Source" value={doc.source} />
                    <MetaRow label="ID" value={doc.id} />
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <Eyebrow>Used by agents</Eyebrow>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Attachment references are managed from each agent&apos;s Knowledge tab.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <StickySaveBar
        changes={changes}
        onSave={() => void save()}
        onDiscard={reset}
        isSaving={updateMut.isPending}
      />
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono tabular-nums">{value}</div>
    </div>
  );
}
