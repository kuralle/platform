import { cn } from "@kuralle/ui/lib/utils";

interface LiveDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Size in px. Default 8. */
  size?: number;
  /** Colour token — `cyan-500` for streaming, `emerald-500` for pulse-success. */
  tone?: "live" | "success" | "warning" | "danger";
  /** Disable the pulse animation. */
  static?: boolean;
}

const TONE_CLASS: Record<NonNullable<LiveDotProps["tone"]>, string> = {
  live: "bg-cyan-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
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
