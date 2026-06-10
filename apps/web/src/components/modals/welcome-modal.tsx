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
import { Link } from "@tanstack/react-router";

interface WelcomeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  {
    id: "agent",
    label: "Build your first agent",
    icon: Sparkles,
    description: "5 minutes from prompt to a live test conversation.",
  },
  {
    id: "number",
    label: "Connect a WhatsApp number",
    icon: Phone,
    description: "Bind your WhatsApp Business number to a published agent.",
  },
  {
    id: "test",
    label: "Test it yourself",
    icon: Users,
    description: "Drive the agent in the test drawer before pointing real customers at it.",
  },
] as const;

export function WelcomeModal({ open, onOpenChange }: WelcomeModalProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const remaining = STEPS.filter((s) => !completed[s.id]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <Eyebrow>Workspace</Eyebrow>
          <DialogTitle className="font-display text-[22px]">Welcome to Kuralle.</DialogTitle>
          <DialogDescription>
            Three steps to your first live conversation. Each one is under five minutes.
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
                    done ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {done ? <Check size={14} /> : <step.icon size={14} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[14px] font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {step.label}
                  </div>
                  <div className="text-[12px] text-muted-foreground">{step.description}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <DialogFooter className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {STEPS.length - remaining} of {STEPS.length} complete
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {remaining === 0 ? "Done" : "Dismiss"}
            </Button>
            <Button nativeButton={false} render={<Link to="/onboarding" />} onClick={() => onOpenChange(false)}>
              Get started
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
