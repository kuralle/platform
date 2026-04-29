import { cn } from "@kuralle/ui/lib/utils";

import { LiveDot } from "./live-dot";

export type ComplianceState = "active" | "action-required" | "violation" | "inactive";

interface ComplianceChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** HIPAA / FERPA / TCPA / EU-AI-Act / SOC 2 / PCI etc. */
  label: string;
  state: ComplianceState;
  /** Optional state suffix (e.g. "BAA pending"). */
  suffix?: string;
}

const STATE_RING: Record<ComplianceState, string> = {
  active:            "border-booked-green/30 bg-booked-green/8 text-operator-slate",
  "action-required": "border-compliance-amber/30 bg-compliance-amber/8 text-operator-slate",
  violation:         "border-risk-crimson/40 bg-risk-crimson/8 text-risk-crimson",
  inactive:          "border-border text-whisper-slate",
};

const STATE_DOT: Record<ComplianceState, React.ComponentProps<typeof LiveDot>["tone"]> = {
  active: "success",
  "action-required": "warning",
  violation: "danger",
  inactive: "success",
};

/**
 * The signature compliance chip. Used on B1 home, C3 LLM tab, C8 compliance
 * tab, I4 posture page. Small caps + state dot + optional suffix.
 */
export function ComplianceChip({ label, state, suffix, className, ...rest }: ComplianceChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5",
        "text-[11px] font-semibold uppercase tracking-[0.06em]",
        STATE_RING[state],
        className,
      )}
      {...rest}
    >
      <LiveDot
        size={6}
        tone={STATE_DOT[state]}
        static
        className={state === "inactive" ? "bg-whisper-slate" : undefined}
      />
      <span>{label}</span>
      {suffix && <span className="font-normal normal-case tracking-normal text-mute-slate">· {suffix}</span>}
    </span>
  );
}
