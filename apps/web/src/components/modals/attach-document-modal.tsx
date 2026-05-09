import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Checkbox } from "@kuralle/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Input } from "@kuralle/ui/components/input";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { File, Globe, Search, Type } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useKb } from "@/hooks/api/kb";
import { formatBytes } from "@/lib/format";

export interface KbAttachCandidate {
  id: string;
  name: string;
  source: string;
  folder: string | null;
  sizeBytes: number;
}

interface AttachDocumentModalProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alreadyAttached: Set<string>;
  onAttach: (docs: KbAttachCandidate[]) => void;
}

const ICON = { file: File, url: Globe, text: Type } as const;

function sourceVisual(source: string): keyof typeof ICON {
  const s = source.toLowerCase();
  if (s.includes("url") || s === "url") return "url";
  if (s === "text") return "text";
  return "file";
}

export function AttachDocumentModal({
  workspaceId,
  open,
  onOpenChange,
  alreadyAttached,
  onAttach,
}: AttachDocumentModalProps) {
  const { data, isPending } = useKb({ workspaceId, limit: 100 });
  const all = data?.items ?? [];
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setPicked({});
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.folder ?? "").toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q),
    );
  }, [all, query]);

  function commit() {
    const docs: KbAttachCandidate[] = all
      .filter((d) => picked[d.id])
      .map((d) => ({
        id: d.id,
        name: d.name,
        source: d.source,
        folder: d.folder,
        sizeBytes: d.sizeBytes,
      }));
    onAttach(docs);
    setPicked({});
    onOpenChange(false);
  }

  const total = Object.values(picked).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">Attach from knowledge base</DialogTitle>
          <DialogDescription>
            Pick documents from the workspace KB. Attaching doesn&apos;t copy the doc — every agent reads the same
            source. To create a new doc, head to <strong>Knowledge base</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, folder, or ID"
            className="h-9 pl-8"
          />
        </div>
        <ScrollArea className="max-h-[360px]">
          {isPending ? (
            <p className="text-[13px] text-muted-foreground">Loading documents…</p>
          ) : filtered.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No documents match this workspace yet.</p>
          ) : (
            <ul className="grid gap-1.5">
              {filtered.map((d) => {
                const isAttached = alreadyAttached.has(d.id);
                const sk = sourceVisual(d.source);
                const Icon = ICON[sk];
                return (
                  <li key={d.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3 transition ${
                        isAttached ? "cursor-not-allowed opacity-50" : "hover:border-primary/40"
                      }`}
                    >
                      <Checkbox
                        checked={isAttached || !!picked[d.id]}
                        disabled={isAttached}
                        onCheckedChange={(c) => setPicked((p) => ({ ...p, [d.id]: !!c }))}
                      />
                      <span className="grid size-7 place-items-center rounded-md border bg-muted text-muted-foreground">
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{d.name}</div>
                        <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                          {d.id} · {d.folder ?? "—"} · {formatBytes(d.sizeBytes)}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {d.source}
                      </Badge>
                      {isAttached && (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Attached
                        </Badge>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter className="flex items-center justify-between">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{total} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={commit} disabled={total === 0}>
              Attach {total > 0 && total}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
