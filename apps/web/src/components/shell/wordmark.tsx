import { cn } from "@kuralle/ui/lib/utils";

interface WordmarkProps {
  className?: string;
  /** Render mark only, no text. */
  iconOnly?: boolean;
}

/**
 * The Kuralle wordmark — geometric K mark in the foreground colour followed
 * by the product name in Geist 600.
 */
export function Wordmark({ className, iconOnly }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <KMark />
      {!iconOnly && (
        <span className="font-display text-[16px] font-semibold tracking-tight text-foreground">
          Kuralle
        </span>
      )}
    </span>
  );
}

function KMark() {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-card"
    >
      <svg viewBox="0 0 20 20" width={16} height={16} fill="none">
        <rect x="4" y="3" width="2.4" height="14" rx="0.6" fill="currentColor" />
        <path
          d="M6.4 10 L14 3 L16.6 5.5 L9.5 11"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 11 L16.6 17 L14 17 L8 12"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
