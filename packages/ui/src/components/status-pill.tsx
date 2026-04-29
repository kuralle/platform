import { cn } from "@kuralle/ui/lib/utils";

import { LiveDot } from "./live-dot";

export type StatusPillTone = "live" | "success" | "warning" | "danger" | "neutral" | "info";

interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusPillTone;
  children: React.ReactNode;
  /** Hide the leading dot — useful when the pill stands alone in a tiny cell. */
  hideDot?: boolean;
}

const TONE_RING: Record<StatusPillTone, string> = {
  live:    "border-live-cyan/40 bg-live-cyan/10 text-mission-black",
  success: "border-booked-green/30 bg-booked-green/8 text-booked-green",
  warning: "border-compliance-amber/30 bg-compliance-amber/8 text-compliance-amber",
  danger:  "border-risk-crimson/40 bg-risk-crimson/8 text-risk-crimson",
  neutral: "border-border bg-soft-hairline text-operator-slate",
  info:    "border-audit-indigo/30 bg-audit-indigo/8 text-audit-indigo",
};

const TONE_DOT: Record<StatusPillTone, React.ComponentProps<typeof LiveDot>["tone"] | "neutral" | "info"> = {
  live: "live",
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
  info: "info",
};

/**
 * The 24px-tall pill that signals every status in the app — agent state on C1,
 * compliance state on B1, batch state on G1, conversation outcome on F1, etc.
 */
export function StatusPill({ tone, hideDot, children, className, ...rest }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-medium uppercase tracking-[0.06em]",
        TONE_RING[tone],
        className,
      )}
      {...rest}
    >
      {!hideDot && <LiveDot size={6} tone={TONE_DOT[tone] === "live" ? "live" : (TONE_DOT[tone] === "success" || TONE_DOT[tone] === "warning" || TONE_DOT[tone] === "danger") ? (TONE_DOT[tone] as "success") : "success"} static={tone !== "live"} className={
        tone === "neutral" ? "bg-whisper-slate" :
        tone === "info" ? "bg-audit-indigo" : undefined
      } />}
      {children}
    </span>
  );
}
