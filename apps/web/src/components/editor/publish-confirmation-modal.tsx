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
}

/**
 * Confirmation dialog shown before publishing an agent.
 * Copy from USER_JOURNEYS.md §4: "X live calls will see the new version
 * after this call ends."
 */
export function PublishConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  isPublishing,
}: PublishConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Publish this version?</DialogTitle>
          <DialogDescription>
            Live calls will see the new version after this call ends.
            In-flight conversations continue on the current version
            until they complete naturally.
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
