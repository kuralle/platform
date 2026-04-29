import { cn } from "@kuralle/ui/lib/utils";

interface LiveDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Size in px. Default 8. */
  size?: number;
  /** Colour token — `live-cyan` for streaming, `booked-green` for pulse-success. */
  tone?: "live" | "success" | "warning" | "danger";
  /** Disable the pulse animation. */
  static?: boolean;
}

const TONE_CLASS: Record<NonNullable<LiveDotProps["tone"]>, string> = {
  live: "bg-live-cyan",
  success: "bg-booked-green",
  warning: "bg-compliance-amber",
  danger: "bg-risk-crimson",
};

/**
 * Single-purpose dot for live/streaming UI elements. The `live` tone is the
 * only place in the design system that may use Live Cyan.
 */
export function LiveDot({ size = 8, tone = "live", static: stat, className, style, ...rest }: LiveDotProps) {
  return (
    <span
      role="status"
      aria-label={tone === "live" ? "Live" : tone}
      className={cn(
        "inline-block rounded-full",
        TONE_CLASS[tone],
        !stat && tone === "live" && "live-pulse",
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...rest}
    />
  );
}
