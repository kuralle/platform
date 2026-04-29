import { Button } from "@kuralle/ui/components/button";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { ScopeChip } from "@kuralle/ui/components/scope-chip";
import { Sheet, SheetContent, SheetTrigger } from "@kuralle/ui/components/sheet";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { cn } from "@kuralle/ui/lib/utils";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, Play } from "lucide-react";
import { type ReactNode, useState } from "react";

import { AgentTestDrawer } from "./agent-test-drawer";

const TABS = [
  { slug: "behavior", label: "Behavior" },
  { slug: "llm", label: "LLM" },
  { slug: "voice", label: "Voice" },
  { slug: "compliance", label: "Compliance" },
] as const;

export type EditorTabSlug = (typeof TABS)[number]["slug"];

interface AgentEditorShellProps {
  agentName: string;
  agentId: string;
  /** Status pill — drives the live/draft chip in the header. */
  status: "live" | "paused" | "draft";
  /** Total unsaved field changes — shown in sticky save bar. */
  changes: number;
  onSave: () => void;
  onDiscard: () => void;
  children: ReactNode;
}

export function AgentEditorShell({
  agentName,
  agentId,
  status,
  changes,
  onSave,
  onDiscard,
  children,
}: AgentEditorShellProps) {
  const router = useRouterState();
  const path = router.location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="border-b bg-card px-8 py-4">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link to="/agents" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft size={12} /> Agents
          </Link>
          <span>/</span>
          <span className="font-mono tabular-nums text-foreground">{agentId}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Agent editor</Eyebrow>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="font-display text-[24px] font-semibold tracking-tight">{agentName}</h1>
              <StatusPill tone={status === "live" ? "success" : status === "draft" ? "neutral" : "warning"}>
                {status}
              </StatusPill>
              <ScopeChip label="prod" />
            </div>
          </div>
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" className="gap-2">
                  <Play size={14} /> Test agent
                </Button>
              }
            />
            <SheetContent side="right" className="w-[560px] sm:max-w-[560px]">
              <AgentTestDrawer agentName={agentName} />
            </SheetContent>
          </Sheet>
        </div>
        <nav className="-mb-[17px] mt-5 flex gap-1 border-b">
          {TABS.map((t) => {
            const href = `/agents/${agentId}/${t.slug}`;
            const active = path === href;
            return (
              <Link
                key={t.slug}
                href={href}
                className={cn(
                  "relative flex h-10 items-center px-3 text-[13px] font-medium transition",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto bg-background px-8 py-8">{children}</div>
      <StickySaveBar changes={changes} onSave={onSave} onDiscard={onDiscard} />
    </div>
  );
}
