import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { DataTable } from "@kuralle/ui/components/data-table";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ComplianceStatusModal } from "@/components/modals/compliance-status-modal";
import { WelcomeModal } from "@/components/modals/welcome-modal";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useHealthCheck } from "@/hooks/api/health";
import { useConversations } from "@/hooks/api/conversations";
import { useAgents } from "@/hooks/api/agents";
import { useWorkspaceSettings } from "@/hooks/api/workspace";
import { useCompliancePosture } from "@/hooks/api/compliance";
import { useDashboard } from "@/hooks/api/home";
import { authClient } from "@/lib/auth-client";
import { formatRelative, formatUsd } from "@/lib/format";
import type { ComplianceState, KpiTilePoint } from "@/types/domain";

/** API row shape for conversations.list — subset of fields used by this screen. */
interface ConversationRow {
  id: string;
  agentId: string | null;
  participantName: string | null;
  participantId: string | null;
  outcome: string | null;
  durationSec: number | null;
  costUsd: number | null;
  startedAt: Date;
  endedAt: Date | null;
  direction: string | null;
}

export const Route = createFileRoute("/_app/home")({
  component: HomeRoute,
});

// First-run detection from better-auth session: a user whose account was
// created in the last 5 minutes and hasn't dismissed the welcome modal in
// THIS browser (per-userId localStorage key) is on first run. No URL state,
// no schema change, no extra RPC — just compares `user.createdAt` against
// `Date.now()`.
const FIRST_RUN_WINDOW_MS = 5 * 60 * 1000;
function welcomeStorageKey(userId: string | undefined): string | null {
  return userId ? `kuralle.welcomeSeen.${userId}` : null;
}
function shouldShowWelcomeOnMount(
  userId: string | undefined,
  userCreatedAt: string | Date | undefined,
): boolean {
  if (!userId || !userCreatedAt) return false;
  const created = new Date(userCreatedAt).getTime();
  if (Number.isNaN(created)) return false;
  if (Date.now() - created > FIRST_RUN_WINDOW_MS) return false;
  if (typeof window === "undefined") return false;
  const key = welcomeStorageKey(userId);
  return key ? window.localStorage.getItem(key) !== "1" : false;
}

function HomeRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: wsSettings } = useWorkspaceSettings({ workspaceId });
  const { data: posture } = useCompliancePosture({ workspaceId });
  const navigate = useNavigate();
  const session = authClient.useSession();
  const userId = session.data?.user?.id;
  const userCreatedAt = session.data?.user?.createdAt as string | Date | undefined;
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  // Auto-open the welcome modal once, after the session resolves: useState's
  // initializer fires only on first render — when better-auth.useSession is
  // still pending — so userId/createdAt are undefined and the modal would
  // never open. Watching them via useEffect catches the post-hydration tick
  // when both values land.
  useEffect(() => {
    if (welcomeOpen) return;
    if (shouldShowWelcomeOnMount(userId, userCreatedAt)) {
      setWelcomeOpen(true);
    }
  }, [userId, userCreatedAt, welcomeOpen]);
  const [complianceOpen, setComplianceOpen] = useState(false);

  const health = useHealthCheck();
  const dashboard = useDashboard({ workspaceId });

  const kpis: KpiTilePoint[] = useMemo(() => {
    const d = dashboard.data;
    if (!d) {
      return [
        { label: "Live calls", value: 0, delta: null, spark: [], live: true },
        { label: "Calls today", value: 0, delta: null, spark: [] },
        { label: "7-day trend", value: 0, delta: null, spark: [] },
      ];
    }
    return [
      { label: "Live calls", value: d.liveCalls, delta: null, spark: [], live: true },
      { label: "Calls today", value: d.todayCalls, delta: null, spark: [] },
      {
        label: "7-day trend",
        value: d.weeklyTrend.count,
        delta: d.weeklyTrend.deltaPct ?? null,
        spark: [],
      },
    ];
  }, [dashboard.data]);

  const conversationsQuery = useConversations({ workspaceId, limit: 6 });
  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data?.items],
  );
  void useAgents({ workspaceId });

  function dismissWelcome() {
    setWelcomeOpen(false);
    const key = welcomeStorageKey(userId);
    if (key && typeof window !== "undefined") {
      window.localStorage.setItem(key, "1");
    }
  }

  const recentColumns = useMemo<ColumnDef<ConversationRow>[]>(() => [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
          {!row.original.endedAt && <LiveDot size={6} tone="live" />}
          {row.original.id}
        </div>
      ),
    },
    {
      id: "agent",
      header: "Agent",
      cell: ({ row }) => row.original.agentId ?? "—",
    },
    {
      id: "caller",
      header: "Caller",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-mono text-[12px] tabular-nums">{row.original.participantId ?? "—"}</span>
          {row.original.participantName && (
            <span className="text-[11px] text-muted-foreground">{row.original.participantName}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "outcome",
      header: "Outcome",
      cell: ({ row }) =>
        !row.original.endedAt ? (
          <StatusPill tone="live">Live · {row.original.direction ?? "inbound"}</StatusPill>
        ) : (
          <StatusPill tone={outcomeTone(row.original.outcome ?? "")}>{row.original.outcome ?? "—"}</StatusPill>
        ),
    },
    {
      accessorKey: "durationSec",
      header: () => <div className="text-right">Duration</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {row.original.durationSec != null
            ? `${Math.floor(row.original.durationSec / 60)}:${String(row.original.durationSec % 60).padStart(2, "0")}`
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "costUsd",
      header: () => <div className="text-right">Cost</div>,
      cell: ({ row }) => (
        <div className="text-right font-mono text-[12px] tabular-nums">
          {row.original.costUsd != null ? formatUsd(row.original.costUsd, { precise: true }) : "—"}
        </div>
      ),
    },
    {
      accessorKey: "startedAt",
      header: () => <div className="text-right">Started</div>,
      cell: ({ row }) => (
        <div className="text-right text-[12px] text-muted-foreground">
          {formatRelative(typeof row.original.startedAt === "string" ? row.original.startedAt : row.original.startedAt.toISOString())}
        </div>
      ),
    },
  ], []);

  const recentTable = useReactTable({
    data: conversations,
    columns: recentColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const d = dashboard.data;
  const activityPending = dashboard.isPending;
  const showCallsActivityCard =
    !activityPending && d != null && (d.todayCalls > 0 || d.liveCalls > 0);
  const chartRowIsSplit = activityPending || showCallsActivityCard;

  const emptyConversationsView = (
    <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-6 px-8 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-muted">
        <BookOpen size={28} className="text-muted-foreground" />
      </div>
      <div className="grid gap-2">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">
          You don&apos;t have an agent yet.
        </h1>
        <p className="max-w-md text-[14px] text-muted-foreground">
          Let&apos;s build one in 5 minutes. Pick a template, pick a voice, run a test call.
          It&apos;ll sound and behave like a real dispatcher in your vertical.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button nativeButton={false} render={<Link to="/agents" />} className="h-11 gap-2 px-5">
          <Plus size={16} /> Build my first agent
        </Button>
      </div>
    </div>
  );

  const dashboardView = (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <StatusPill tone={health.isLoading ? "neutral" : health.isError ? "danger" : "live"}>
          API {health.isLoading ? "…" : health.isError ? "down" : "live"}
        </StatusPill>
      </div>
      <PageHeader
        eyebrow={`Workspace · ${wsSettings?.name ?? "Workspace"}`}
        title="Today"
        description={`Live activity, recent calls, and compliance posture for ${formatRelative(new Date().toISOString()).replace(" ago", "")}.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setWelcomeOpen(true)}>
              Open setup checklist
            </Button>
            <Button nativeButton={false} render={<Link to="/conversations" />}>
              Open conversations <ArrowUpRight size={16} />
            </Button>
          </>
        }
      />

      {/* KPI row */}
      <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-x-visible md:pb-0 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="shrink-0 w-[180px] md:w-auto">
          <KpiTile
            label={kpi.label}
            value={
              kpi.currency
                ? formatUsd(kpi.value)
                : kpi.value.toLocaleString()
            }
            delta={kpi.delta}
            spark={kpi.spark}
            currency={kpi.currency}
            live={kpi.live}
          />
          </div>
        ))}
      </div>

      {/* Compliance + calls activity (real metrics only; no fabricated sparkline) */}
      <div
        className={
          chartRowIsSplit ? "mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]" : "mt-6 grid gap-4"
        }
      >
        {activityPending ? (
          <Card className="p-5">
            <div className="animate-pulse space-y-4">
              <div className="h-3 w-36 rounded bg-muted" />
              <div className="h-7 w-48 rounded bg-muted" />
              <div className="h-[100px] rounded bg-muted/60" />
            </div>
          </Card>
        ) : showCallsActivityCard && d ? (
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <Eyebrow>Calls today</Eyebrow>
                <div className="mt-1 font-display text-[18px] font-semibold">
                  {d.todayCalls.toLocaleString()}{" "}
                  {d.todayCalls === 1 ? "call" : "calls"}
                </div>
              </div>
              {d.liveCalls > 0 ? (
                <div className="flex items-center gap-2">
                  <LiveDot size={8} tone="live" />
                  <span className="text-[12px] text-muted-foreground">
                    {d.liveCalls} {d.liveCalls === 1 ? "call" : "calls"} in flight
                  </span>
                </div>
              ) : null}
            </div>
            <p className="text-[13px] text-muted-foreground">
              Hourly charts appear once we have bucketed traffic for this workspace.
            </p>
          </Card>
        ) : null}
        <Card className="p-5">
          <Eyebrow>Compliance posture</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            <ComplianceChip
              label="HIPAA"
              state={(posture?.hipaa ?? "inactive") as ComplianceState}
              suffix={posture?.hipaa === "inactive" ? "not in scope" : undefined}
            />
            <ComplianceChip label="FERPA" state={(posture?.ferpa ?? "inactive") as ComplianceState} suffix="not in scope" />
            <ComplianceChip label="TCPA" state={(posture?.tcpa ?? "active") as ComplianceState} suffix="PEWC + DNC ✓" />
            <ComplianceChip label="EU AI Act" state={(posture?.euAiAct ?? "action-required") as ComplianceState} suffix="risk class needed" />
          </div>
          <Button
            variant="ghost"
            className="mt-4 h-8 px-2 text-[12px]"
            onClick={() => setComplianceOpen(true)}
          >
            View full posture →
          </Button>
        </Card>
      </div>

      {/* Recent conversations */}
      <div className="mt-6 flex items-center justify-between">
        <div>
          <Eyebrow>Recent conversations</Eyebrow>
          <div className="mt-1 font-display text-[16px] font-semibold">Last 90 minutes</div>
        </div>
        <Button nativeButton={false} render={<Link to="/conversations" />} variant="ghost" className="h-8 px-2 text-[12px]">
          Open all →
        </Button>
      </div>
      <DataTable
        table={recentTable}
        hidePagination
        className="mt-3"
        onRowClick={(c) =>
          navigate({
            to: c.endedAt == null ? "/conversations/$id/live" : "/conversations/$id",
            params: { id: c.id },
          })
        }
      />

    </div>
  );

  return (
    <>
      {!conversationsQuery.isLoading && conversations.length === 0
        ? emptyConversationsView
        : dashboardView}
      <WelcomeModal
        open={welcomeOpen}
        onOpenChange={(open) => {
          if (!open) dismissWelcome();
        }}
      />
      <ComplianceStatusModal open={complianceOpen} onOpenChange={setComplianceOpen} />
    </>
  );
}

function outcomeTone(outcome: string): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "booked" || outcome === "qualified") return "success";
  if (outcome === "voicemail" || outcome === "abandoned") return "warning";
  if (outcome === "missed" || outcome === "escalated") return "danger";
  return "neutral";
}
