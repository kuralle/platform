import { Card } from "@kuralle/ui/components/card";
import { Checkbox } from "@kuralle/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { RadioGroup, RadioGroupItem } from "@kuralle/ui/components/radio-group";
import { WizardShell } from "@kuralle/ui/components/wizard-shell";
import { cn } from "@kuralle/ui/lib/utils";
import { Check } from "lucide-react";
import { useState } from "react";

interface ImportNumberWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TRANSPORTS = [
  { id: "twilio-native", label: "Twilio Native", description: "Provision new numbers. Fastest path." },
  { id: "twilio-byo", label: "Twilio BYO", description: "Use your existing Twilio account." },
  { id: "sip", label: "SIP / BYOC", description: "Bring your own carrier or PBX." },
];

const DISCOVERED = [
  "+1 206 555 9384",
  "+1 206 555 4112",
  "+1 415 555 8821",
  "+1 425 555 7733",
  "+1 503 555 0911",
];

export function ImportNumberWizard({ open, onOpenChange }: ImportNumberWizardProps) {
  const [transport, setTransport] = useState("twilio-native");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const total = Object.values(picked).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="font-display text-[20px]">Import phone numbers</DialogTitle>
          <DialogDescription>Three steps. We'll attach the numbers to a default agent so you can test immediately.</DialogDescription>
        </DialogHeader>
        <div className="h-[420px]">
          <WizardShell
            steps={[
              {
                id: "transport",
                title: "Transport",
                description: "Pick how Kuralle should reach the number.",
                render: () => (
                  <RadioGroup value={transport} onValueChange={setTransport} className="grid gap-3">
                    {TRANSPORTS.map((t) => (
                      <label
                        key={t.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-md border bg-background p-4 transition",
                          transport === t.id && "border-primary bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value={t.id} className="mt-0.5" />
                        <div>
                          <div className="text-[14px] font-medium">{t.label}</div>
                          <div className="text-[12px] text-muted-foreground">{t.description}</div>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                ),
              },
              {
                id: "discover",
                title: "Discover",
                description: "We probed your account and found the following numbers. Pick the ones to import.",
                render: () => (
                  <Card className="p-4">
                    <ul className="grid gap-2">
                      {DISCOVERED.map((n) => (
                        <li key={n} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={`n-${n}`}
                              checked={!!picked[n]}
                              onCheckedChange={(c) => setPicked((p) => ({ ...p, [n]: !!c }))}
                            />
                            <label htmlFor={`n-${n}`} className="font-mono text-[13px] tabular-nums">
                              {n}
                            </label>
                          </div>
                          <Eyebrow>Discovered</Eyebrow>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 text-[12px] text-muted-foreground">{total} selected</div>
                  </Card>
                ),
              },
              {
                id: "done",
                title: "Done",
                description: "We'll attach these numbers to the workspace's default agent.",
                render: () => (
                  <Card className="p-6 text-center">
                    <Check size={28} className="mx-auto text-emerald-500" />
                    <p className="mt-3 text-[14px] font-medium">Imported {total || 0} numbers.</p>
                  </Card>
                ),
              },
            ]}
            onFinish={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
