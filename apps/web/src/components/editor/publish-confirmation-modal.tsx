import { Button } from "@kuralle/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";

interface PublishConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPublishing: boolean;
  /** Optional live-call count rendered into the §4 copy. Falls back to "Live calls". */
  liveCallCount?: number;
}

/**
 * Confirmation dialog shown before publishing an agent.
 *
 * Copy is the verbatim §4 sentence from USER_JOURNEYS.md (line 109):
 *   "X live calls will see the new version after this call ends."
 *
 * The `X` placeholder is rendered as a number when `liveCallCount` is
 * supplied; otherwise it degrades to "Live calls" so we never display a
 * fake count. Querying live-conversation count is S3 work — the prop is
 * the seam.
 */
export function PublishConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isPublishing,
  liveCallCount,
}: PublishConfirmationModalProps) {
  const lede =
    typeof liveCallCount === "number"
      ? `${liveCallCount} live call${liveCallCount === 1 ? "" : "s"}`
      : "Live calls";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Publish this version?</DialogTitle>
          <DialogDescription>
            {lede} will see the new version after this call ends.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPublishing}>
            {isPublishing ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
