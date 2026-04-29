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
  live:    "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  danger:  "border-destructive/40 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-foreground",
  info:    "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
};

const TONE_DOT_OVERRIDE: Partial<Record<StatusPillTone, string>> = {
  neutral: "bg-muted-foreground",
  info: "bg-indigo-500",
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
      {!hideDot && (
        <LiveDot
          size={6}
          tone={tone === "live" ? "live" : tone === "warning" ? "warning" : tone === "danger" ? "danger" : "success"}
          static={tone !== "live"}
          className={TONE_DOT_OVERRIDE[tone]}
        />
      )}
      {children}
    </span>
  );
}
