import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Check, Minus, X } from "lucide-react";

interface RegulationCard {
  title: string;
  state: "active" | "action-required" | "violation" | "inactive";
  requirements: { label: string; met: boolean | "n/a" }[];
}

const REGULATIONS: RegulationCard[] = [
  {
    title: "HIPAA",
    state: "inactive",
    requirements: [
      { label: "BAA executed", met: false },
      { label: "Zero retention mode", met: false },
      { label: "Identity verification on transcript export", met: "n/a" },
      { label: "ePHI redaction", met: "n/a" },
      { label: "Audit logs retained ≥ 6 yrs", met: "n/a" },
    ],
  },
  {
    title: "FERPA",
    state: "inactive",
    requirements: [
      { label: "Educational record consent flow", met: false },
      { label: "Identity-verification gate", met: false },
      { label: "Directory-info disclosure script", met: false },
      { label: "Annual notification", met: "n/a" },
      { label: "Parent / eligible-student access logs", met: "n/a" },
    ],
  },
  {
    title: "TCPA",
    state: "active",
    requirements: [
      { label: "PEWC consent on file for outbound", met: true },
      { label: "DNC scrub on schedule", met: true },
      { label: "Time-of-day window enforcement (8am–9pm)", met: true },
      { label: "Opt-out STOP keywords parsed", met: true },
      { label: "Caller-ID matches registered number", met: true },
    ],
  },
  {
    title: "EU AI Act",
    state: "action-required",
    requirements: [
      { label: "AI disclosure on first turn", met: true },
      { label: "Risk classification documented", met: false },
      { label: "Bias evaluation on shipped agents", met: false },
      { label: "Real-time output logging", met: true },
      { label: "Incident-response playbook", met: false },
    ],
  },
];

interface ComplianceStatusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComplianceStatusModal({ open, onOpenChange }: ComplianceStatusModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <Eyebrow>Workspace posture</Eyebrow>
          <DialogTitle className="font-display text-[22px]">Compliance status</DialogTitle>
          <DialogDescription>
            Live snapshot. Each regulation is auto-evaluated every 15 minutes against your active
            agents and last 7 days of conversations.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {REGULATIONS.map((reg) => (
            <div key={reg.title} className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-display text-[15px] font-semibold">{reg.title}</div>
                <ComplianceChip label={reg.title} state={reg.state} />
              </div>
              <ul className="grid gap-1.5">
                {reg.requirements.map((req) => (
                  <li key={req.label} className="flex items-center gap-2 text-[12px]">
                    {req.met === true && (
                      <Check size={12} className="shrink-0 text-booked-green" />
                    )}
                    {req.met === false && (
                      <X size={12} className="shrink-0 text-risk-crimson" />
                    )}
                    {req.met === "n/a" && (
                      <Minus size={12} className="shrink-0 text-whisper-slate" />
                    )}
                    <span className={req.met === "n/a" ? "text-whisper-slate" : "text-operator-slate"}>
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
