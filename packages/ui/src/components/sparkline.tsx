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
  signal: "stroke-primary",
  live: "stroke-cyan-500",
  currency: "stroke-foreground",
  success: "stroke-emerald-500",
  warning: "stroke-amber-500",
  danger: "stroke-destructive",
};

const TONE_FILL: Record<NonNullable<SparklineProps["tone"]>, string> = {
  signal: "fill-primary/12",
  live: "fill-cyan-500/12",
  currency: "fill-foreground/12",
  success: "fill-emerald-500/12",
  warning: "fill-amber-500/12",
  danger: "fill-destructive/12",
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
