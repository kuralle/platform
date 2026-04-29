import { cn } from "@kuralle/ui/lib/utils";

import { LiveDot } from "./live-dot";
import { Sparkline } from "./sparkline";

interface KpiTileProps {
  label: string;
  /** Pre-formatted display value (e.g. "$47,200" or "61%"). */
  value: string;
  /** Decimal delta — 0.18 → "+18%". */
  delta: number;
  /** 14-point sparkline series. */
  spark?: number[];
  /** When true, value is rendered in Receipt Gold and `data-currency` is set. */
  currency?: boolean;
  /** When true, leading Live Cyan dot pulses next to the label. */
  live?: boolean;
  className?: string;
}

/**
 * The 5-up KPI tile used on B1 Today dashboard, I4 compliance posture, L4
 * revenue attribution, L5 ROI receipt. Hero number in JetBrains Mono with
 * tabular numerals; delta chip below; optional sparkline on the right.
 */
export function KpiTile({ label, value, delta, spark, currency, live, className }: KpiTileProps) {
  const positive = delta >= 0;
  const deltaPct = `${positive ? "+" : ""}${(delta * 100).toFixed(0)}%`;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[10px] border bg-card p-5",
        className,
      )}
      data-currency={currency || undefined}
      data-live={live || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {live && <LiveDot size={8} tone="live" />}
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {label}
          </span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span
          className={cn(
            "font-mono text-[32px] leading-9 font-medium tracking-tight",
            currency ? "text-foreground" : "text-foreground",
          )}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        {spark && (
          <Sparkline
            data={spark}
            tone={live ? "live" : currency ? "currency" : "signal"}
            width={84}
            height={28}
            className="shrink-0"
          />
        )}
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums",
            positive ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive",
          )}
        >
          {positive ? "↑" : "↓"} {deltaPct.replace("-", "")}
        </span>
        <span className="text-muted-foreground">vs last 7d</span>
      </div>
    </div>
  );
}
