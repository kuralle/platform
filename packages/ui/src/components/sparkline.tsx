import { cn } from "@kuralle/ui/lib/utils";

interface SparklineProps extends Omit<React.SVGProps<SVGSVGElement>, "stroke"> {
  data: number[];
  width?: number;
  height?: number;
  /** Stroke + fill ramp — `live` paints Live Cyan, otherwise Signal Teal. */
  tone?: "signal" | "live" | "currency" | "success" | "warning" | "danger";
  /** Render as filled area (default true) or just the line. */
  filled?: boolean;
}

const TONE_STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
  signal: "stroke-signal-teal",
  live: "stroke-live-cyan",
  currency: "stroke-receipt-gold",
  success: "stroke-booked-green",
  warning: "stroke-compliance-amber",
  danger: "stroke-risk-crimson",
};

const TONE_FILL: Record<NonNullable<SparklineProps["tone"]>, string> = {
  signal: "fill-signal-teal/12",
  live: "fill-live-cyan/12",
  currency: "fill-receipt-gold/12",
  success: "fill-booked-green/12",
  warning: "fill-compliance-amber/12",
  danger: "fill-risk-crimson/12",
};

export function Sparkline({
  data,
  width = 60,
  height = 16,
  tone = "signal",
  filled = true,
  className,
  ...rest
}: SparklineProps) {
  if (data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = Math.max(1, max - min);
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width.toFixed(2)},${height} L0,${height} Z`;

  return (
    <svg
      role="img"
      aria-label="Sparkline trend"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("inline-block", className)}
      {...rest}
    >
      {filled && <path d={areaPath} className={cn(TONE_FILL[tone], "stroke-none")} />}
      <path
        d={linePath}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(TONE_STROKE[tone], "fill-none")}
      />
    </svg>
  );
}
