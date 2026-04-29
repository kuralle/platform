import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { cn } from "@kuralle/ui/lib/utils";

import { Button } from "./button";

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  /** Render the step body. Receives the navigate helpers so the step can
   *  trigger Next when an internal validation passes. */
  render: (ctx: { goNext: () => void; goBack: () => void; index: number; total: number }) => ReactNode;
  /** Block forward navigation while this is true. */
  isBlocked?: boolean;
}

interface WizardShellProps {
  steps: WizardStep[];
  /** Optional title shown at the top. */
  title?: string;
  /** Final-step label, defaults to "Finish". */
  finishLabel?: string;
  onFinish?: () => void;
  /** Initial step index — useful for tests / deep-linking. */
  initialIndex?: number;
  className?: string;
}

/**
 * The reusable wizard shell — drives A3 onboarding, G2 batch create, M5
 * connector wizard, M7 number import. 5-step pattern: header strip with
 * progress dots, scrollable body, sticky footer with Back / Next or Finish.
 */
export function WizardShell({
  steps,
  title,
  finishLabel = "Finish",
  onFinish,
  initialIndex = 0,
  className,
}: WizardShellProps) {
  const [index, setIndex] = useState(initialIndex);
  const total = steps.length;
  const step = steps[index];

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        onFinish?.();
        return i;
      }
      return i + 1;
    });
  }, [onFinish, total]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!step) return null;
  const isLast = index === total - 1;

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b bg-card px-6 py-4">
        {title && <h2 className="font-display text-[18px] font-semibold tracking-tight text-foreground">{title}</h2>}
        <div className="mt-3 flex items-center gap-3">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div
                aria-current={i === index ? "step" : undefined}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-semibold transition",
                  i < index && "border-primary bg-primary text-card",
                  i === index && "border-primary text-primary",
                  i > index && "border-border text-muted-foreground",
                )}
              >
                {i < index ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "hidden text-[12px] font-medium uppercase tracking-[0.06em] sm:inline",
                  i <= index ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.title}
              </span>
              {i < total - 1 && (
                <span
                  className={cn(
                    "h-px w-8",
                    i < index ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-background p-6">
        {step.description && (
          <p className="mb-4 text-[14px] text-muted-foreground">{step.description}</p>
        )}
        {step.render({ goNext, goBack, index, total })}
      </div>

      <div className="flex items-center justify-between border-t bg-card px-6 py-3">
        <Button variant="ghost" onClick={goBack} disabled={index === 0}>
          <ChevronLeft size={16} /> Back
        </Button>
        <span className="font-mono text-[12px] text-muted-foreground">
          Step {index + 1} of {total}
        </span>
        <Button onClick={goNext} disabled={step.isBlocked}>
          {isLast ? finishLabel : (
            <>
              Next <ChevronRight size={16} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
