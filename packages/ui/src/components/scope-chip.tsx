import { cn } from "@kuralle/ui/lib/utils";

interface ScopeChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: "indigo" | "neutral";
}

/**
 * The TopBar environment / region chip — Audit Indigo by default. Reused for
 * any "this view is scoped to X" indicator (env, region, persona).
 */
export function ScopeChip({ label, tone = "indigo", className, ...rest }: ScopeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 font-mono text-[11px] uppercase tracking-[0.04em]",
        tone === "indigo" && "border-indigo-500/30 bg-indigo-500/8 text-indigo-500",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        className,
      )}
      {...rest}
    >
      {label}
    </span>
  );
}
