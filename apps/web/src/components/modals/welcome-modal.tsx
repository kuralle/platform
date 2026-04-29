import { Button } from "@kuralle/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Check, Phone, Sparkles, Users } from "lucide-react";
import { useState } from "react";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  {
    id: "agent",
    label: "Build your first agent",
    icon: Sparkles,
    description: "5 minutes from prompt to live test call.",
  },
  {
    id: "number",
    label: "Connect a phone number",
    icon: Phone,
    description: "Twilio-native, BYO carrier, or SIP.",
  },
  {
    id: "test",
    label: "Test call yourself",
    icon: Users,
    description: "Drive the agent live before pointing real customers at it.",
  },
] as const;

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const remaining = STEPS.filter((s) => !completed[s.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <Eyebrow>Workspace · Calderon HVAC</Eyebrow>
          <DialogTitle className="font-display text-[22px]">Welcome to Kuralle.</DialogTitle>
          <DialogDescription>
            Three steps to your first booked call. Each one is under five minutes.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-2 grid gap-2">
          {STEPS.map((step) => {
            const done = !!completed[step.id];
            return (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-md border bg-background p-3"
              >
                <button
                  type="button"
                  aria-pressed={done}
                  onClick={() => setCompleted((c) => ({ ...c, [step.id]: !c[step.id] }))}
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border transition ${
                    done ? "border-booked-green bg-booked-green/10 text-booked-green" : "border-border text-mute-slate hover:border-signal-teal hover:text-signal-teal"
                  }`}
                >
                  {done ? <Check size={14} /> : <step.icon size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[14px] font-medium ${done ? "text-mute-slate line-through" : "text-foreground"}`}>
                    {step.label}
                  </div>
                  <div className="text-[12px] text-mute-slate">{step.description}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <DialogFooter className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[12px] tabular-nums text-mute-slate">
            {STEPS.length - remaining} of {STEPS.length} complete
          </span>
          <Button onClick={() => onOpenChange(false)}>{remaining === 0 ? "Done" : "Got it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
