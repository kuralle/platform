import { cn } from "@kuralle/ui/lib/utils";

import { Button } from "./button";

interface StickySaveBarProps {
  changes: number;
  onDiscard: () => void;
  onSave: () => void;
  isSaving?: boolean;
  className?: string;
}

/**
 * The 64px sticky save bar used on every editor page (C2/C3/C4/C8/I1/H1).
 * Reads "All changes saved" in Booked Green when clean.
 */
export function StickySaveBar({ changes, onDiscard, onSave, isSaving, className }: StickySaveBarProps) {
  const clean = changes === 0;
  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-10 flex h-16 items-center justify-between border-t bg-card px-6",
        className,
      )}
    >
      <span
        className={cn(
          "text-[12px]",
          clean ? "text-emerald-500" : "text-muted-foreground",
        )}
      >
        {clean
          ? "All changes saved."
          : `Unsaved changes — ${changes} field${changes === 1 ? "" : "s"} modified.`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" disabled={clean || isSaving} onClick={onDiscard}>
          Discard
        </Button>
        <Button disabled={clean || isSaving} onClick={onSave}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
