import { cn } from "@kuralle/ui/lib/utils";
import { MessageCircle, X } from "lucide-react";

import type { WidgetStringsConfig, WidgetThemeConfig } from "./types";

export function WidgetPreview({
  theme,
  strings,
  panelOpen = true,
}: {
  theme: WidgetThemeConfig;
  strings: WidgetStringsConfig;
  panelOpen?: boolean;
}) {
  const isDark = theme.theme === "dark";
  const positionClass =
    theme.position === "bottom-left" ? "left-4" : "right-4";

  return (
    <div className="relative h-full w-full max-w-[720px] rounded-lg border bg-card shadow-[0_24px_60px_rgba(11,18,32,0.06)]">
      <div className="grid h-full grid-rows-[auto_1fr]">
        <div className="border-b px-6 py-4">
          <div className="font-display text-[16px] font-semibold">preview</div>
        </div>
        <div className="relative flex items-center justify-center bg-muted/40 text-[12px] text-muted-foreground">
          Page content shown by your CMS
          <div
            className={cn("absolute bottom-4 flex flex-col", positionClass)}
            data-theme={theme.theme}
            style={
              {
                "--kuralle-accent-color": theme.primaryColor,
              } as React.CSSProperties
            }
          >
            {!panelOpen && (
              <button
                type="button"
                className="grid size-[60px] place-items-center rounded-full text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
                style={{ backgroundColor: "#000000" }}
                aria-label="Open chat"
              >
                <MessageCircle size={24} />
              </button>
            )}
            {panelOpen && (
              <div
                className={cn(
                  "flex w-[380px] max-h-[min(520px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)]",
                  isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800",
                )}
              >
                <div
                  className="flex items-start justify-between gap-2 px-4 py-3 text-white"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-semibold">{strings.title}</h3>
                    <p className="truncate text-[12px] opacity-90">{strings.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 opacity-80 hover:opacity-100"
                    aria-label="Close chat"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div
                  className={cn(
                    "flex flex-1 flex-col gap-3 p-4 text-[13px]",
                    isDark ? "bg-slate-950" : "bg-slate-50",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2",
                      isDark ? "bg-slate-800 text-slate-100" : "bg-white text-slate-800",
                    )}
                  >
                    {strings.greeting}
                  </div>
                </div>
                <div
                  className={cn(
                    "flex items-end gap-2 border-t p-3",
                    isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
                  )}
                >
                  <div
                    className={cn(
                      "min-h-9 flex-1 rounded-lg border px-3 py-2 text-[12px] text-muted-foreground",
                      isDark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white",
                    )}
                  >
                    Type your message…
                  </div>
                  <button
                    type="button"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-white"
                    style={{ backgroundColor: theme.primaryColor }}
                    aria-label="Send message"
                  >
                    <MessageCircle size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
