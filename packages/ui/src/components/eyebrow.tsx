import { cn } from "@kuralle/ui/lib/utils";

interface EyebrowProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

/**
 * The 11px small-caps eyebrow used everywhere section labels appear in the
 * Vokari design system.
 */
export function Eyebrow({ children, className, ...rest }: EyebrowProps) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.08em] text-mute-slate",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
