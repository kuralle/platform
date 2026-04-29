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
import { useMemo, useState } from "react";

import { formatBytes, makeKbDocuments } from "@/mocks";
import type { KbDocument } from "@/mocks/kb";

interface AttachDocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Doc IDs already attached to the agent. They render disabled. */
  alreadyAttached: Set<string>;
  onAttach: (docs: KbDocument[]) => void;
}

const ICON = { file: File, url: Globe, text: Type } as const;

export function AttachDocumentModal({ open, onOpenChange, alreadyAttached, onAttach }: AttachDocumentModalProps) {
  const all = useMemo(() => makeKbDocuments(8), []);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.folder.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q),
    );
  }, [all, query]);

  function commit() {
    const docs = all.filter((d) => picked[d.id]);
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
            Pick documents from the workspace KB. Attaching doesn't copy the doc — every agent reads the same source.
            To create a new doc, head to <strong>Knowledge base</strong>.
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
          <ul className="grid gap-1.5">
            {filtered.map((d) => {
              const isAttached = alreadyAttached.has(d.id);
              const Icon = ICON[d.source];
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
                        {d.id} · {d.folder} · {formatBytes(d.sizeBytes)}
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
        </ScrollArea>
        <DialogFooter className="flex items-center justify-between">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {total} selected
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={commit} disabled={total === 0}>Attach {total > 0 && total}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
