import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
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
import { useMemo, useState } from "react";

import { formatRelative } from "@/lib/format";
import { formatBytes, makeKbDocuments } from "@/mocks";

// Retrieval / RAG indexing settings (embedding model, vector distance) are a
// system concern — Kuralle picks the embedding model and chunking strategy.
// Users only control the document content, name, folder, and (for URLs) auto-sync.

export const Route = createFileRoute("/_app/knowledge/$docId")({
  component: KnowledgeDocRoute,
});

const SOURCE_ICON = { file: FileIcon, url: Globe, text: Type } as const;

const SAMPLE_TEXT = `# Calderon HVAC — pricing book

| Service                        | Window           | Base price | Notes                          |
|--------------------------------|------------------|-----------:|--------------------------------|
| Diagnostic visit (regular)     | M–F 8a–6p        |      $89   | Waived if work proceeds.       |
| Diagnostic visit (after-hours) | nights / weekend |     $169   | TCPA-disclosed when scheduled. |
| Furnace tune-up (annual)       | M–F              |     $129   | Includes filter swap.          |
| AC tune-up (annual)            | M–F              |     $149   | Refrigerant top-off extra.     |
| Emergency dispatch             | 24/7             |     $295   | 90-min ETA in primary zips.    |

We never quote installed-equipment prices over the phone — escalate to a human and book the in-home estimate.
`;

function KnowledgeDocRoute() {
  const navigate = useNavigate();
  const { docId } = Route.useParams();
  const all = useMemo(() => makeKbDocuments(8), []);
  const seed = all.find((d) => d.id === docId) ?? all[0]!;

  const [name, setName] = useState(seed.name);
  const [folder, setFolder] = useState(seed.folder);
  const [content, setContent] = useState(seed.source === "text" ? SAMPLE_TEXT : SAMPLE_TEXT);
  const [autoSync, setAutoSync] = useState(seed.source === "url");

  const [original] = useState({ name, folder, content, autoSync });
  const changes =
    (name !== original.name ? 1 : 0) +
    (folder !== original.folder ? 1 : 0) +
    (content !== original.content ? 1 : 0) +
    (autoSync !== original.autoSync ? 1 : 0);

  const Icon = SOURCE_ICON[seed.source];

  function reset() {
    setName(original.name);
    setFolder(original.folder);
    setContent(original.content);
    setAutoSync(original.autoSync);
  }

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-8 py-6">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Link to="/knowledge" className="inline-flex items-center gap-1 hover:text-foreground">
              <ChevronLeft size={12} /> Knowledge base
            </Link>
            <span>/</span>
            <span className="font-mono tabular-nums text-foreground">{seed.id}</span>
          </div>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-md border bg-muted text-muted-foreground">
                <Icon size={18} />
              </span>
              <div>
                <Eyebrow>Document · {seed.source}</Eyebrow>
                <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight">{name}</h1>
              </div>
              <StatusPill
                tone={
                  seed.status === "ready"
                    ? "success"
                    : seed.status === "indexing"
                      ? "info"
                      : seed.status === "needs_refresh"
                        ? "warning"
                        : "danger"
                }
              >
                {seed.status.replace("_", " ")}
              </StatusPill>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="gap-1.5">
                <RefreshCcw size={14} /> Refresh
              </Button>
              <Button variant="outline" className="gap-1.5">
                <Download size={14} /> Download
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive"
                onClick={() => navigate({ to: "/knowledge" })}
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
                  {seed.source === "text"
                    ? "Inline body"
                    : seed.source === "url"
                      ? "Indexed URL"
                      : "Imported file content"}
                </h2>
                {seed.source === "url" ? (
                  <div className="mt-4 grid gap-3">
                    <Field>
                      <FieldLabel>Source URL</FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input value={seed.url ?? ""} readOnly className="font-mono text-[13px]" />
                        <Button variant="outline" size="icon" aria-label="Open URL">
                          <ExternalLink size={14} />
                        </Button>
                      </div>
                    </Field>
                    <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                      <div>
                        <div className="text-[13px] font-medium">Auto-sync</div>
                        <div className="text-[12px] text-muted-foreground">
                          Re-fetch when the source changes.
                        </div>
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

              {seed.status === "needs_refresh" && (
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
                    <FieldLabel>Folder</FieldLabel>
                    <Select value={folder} onValueChange={(v) => v != null && setFolder(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Pricing", "Operations", "Policy", "Marketing", "Compliance"].map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <MetaRow label="Size" value={formatBytes(seed.sizeBytes)} />
                    <MetaRow label="Updated" value={formatRelative(seed.updatedAt)} />
                    <MetaRow label="Source" value={seed.source} />
                    <MetaRow label="ID" value={seed.id} />
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <Eyebrow>Used by agents</Eyebrow>
                <div className="mt-2 text-[13px] text-muted-foreground">
                  {seed.dependentAgents.length === 0
                    ? "No agents reference this document yet."
                    : `${seed.dependentAgents.length} agent${seed.dependentAgents.length === 1 ? "" : "s"} attach this doc:`}
                </div>
                {seed.dependentAgents.length > 0 && (
                  <ScrollArea className="mt-3 max-h-[180px]">
                    <ul className="grid gap-1.5">
                      {seed.dependentAgents.map((a) => (
                        <li
                          key={a}
                          className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-[13px]"
                        >
                          <span>{a}</span>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            attached
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Detaching an agent doesn't delete the document — it just removes the reference.
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
      <StickySaveBar changes={changes} onSave={() => undefined} onDiscard={reset} />
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
