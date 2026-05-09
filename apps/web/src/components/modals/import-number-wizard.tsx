import { Button } from "@kuralle/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";

const PROVISION_EMAIL = "onboarding@kuralle.app";

interface ImportNumberWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportNumberWizard({ open, onOpenChange }: ImportNumberWizardProps) {
  const mailto = `mailto:${PROVISION_EMAIL}?subject=${encodeURIComponent("Number provisioning")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">We&apos;ll provision your number for you.</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Twilio number provisioning during closed testing happens via our team — we want routing, business
            verification, and number choice right before you go live. Email us with the area code and use case and
            we&apos;ll get you set up the same day.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button nativeButton={false} render={<a href={mailto} />}>
            Email {PROVISION_EMAIL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
