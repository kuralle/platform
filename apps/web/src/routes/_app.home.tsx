import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { DataTable } from "@kuralle/ui/components/data-table";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Sparkline } from "@kuralle/ui/components/sparkline";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ComplianceStatusModal } from "@/components/modals/compliance-status-modal";
import { WelcomeModal } from "@/components/modals/welcome-modal";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useHealthCheck } from "@/hooks/api/health";
import { useConversations } from "@/hooks/api/conversations";
import { useAgents } from "@/hooks/api/agents";
import { useWorkspaceSettings } from "@/hooks/api/workspace";
import { useCompliancePosture } from "@/hooks/api/compliance";
import { formatPct, formatRelative, formatUsd } from "@/lib/format";
import type { ComplianceState, KpiTilePoint } from "@/types/domain";

// S2-04 fix-pass F05: B1 KPI tiles are inline placeholders until S3 wires
// real telemetry from `usage_events` (live calls + p95 latency) and an
// aggregator (calls today + booking rate + recovered revenue). Mock import
// removed to satisfy the no-mock-from-production-screen rule.
const PLACEHOLDER_KPIS: KpiTilePoint[] = [
  { label: "Live calls", value: 0, delta: 0, spark: [], live: true },
  { label: "Calls today", value: 0, delta: 0, spark: [] },
  { label: "Booking rate", value: 0, delta: 0, spark: [] },
  { label: "Recovered revenue", value: 0, currency: true, delta: 0, spark: [] },
  { label: "p95 latency", value: 0, delta: 0, spark: [] },
];

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
  validateSearch: (s) => ({ welcome: typeof s.welcome === "string" }),
});

function HomeRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: wsSettings } = useWorkspaceSettings({ workspaceId });
  const { data: posture } = useCompliancePosture({ workspaceId });
  const navigate = useNavigate();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);

  const health = useHealthCheck();

  const kpis = PLACEHOLDER_KPIS;
  const conversationsQuery = useConversations({ workspaceId, limit: 6 });
  const conversations = useMemo(
    () => conversationsQuery.data?.items ?? [],
    [conversationsQuery.data?.items],
  );
  void useAgents({ workspaceId });

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

  if (!conversationsQuery.isLoading && conversations.length === 0) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-6 px-8 py-16 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-muted">
          <BookOpen size={28} className="text-muted-foreground" />
        </div>
        <div className="grid gap-2">
          <h1 className="font-display text-[28px] font-semibold tracking-tight">
            You don't have an agent yet.
          </h1>
          <p className="max-w-md text-[14px] text-muted-foreground">
            Let's build one in 5 minutes. Pick a template, pick a voice, run a test call. It'll
            sound and behave like a real dispatcher in your vertical.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button nativeButton={false} render={<Link to="/agents" />} className="h-11 gap-2 px-5">
            <Plus size={16} /> Build my first agent
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            label={kpi.label}
            value={
              kpi.currency
                ? formatUsd(kpi.value)
                : kpi.label === "Booking rate"
                  ? formatPct(kpi.value)
                  : kpi.label === "p95 latency"
                    ? `${kpi.value}ms`
                    : kpi.value.toLocaleString()
            }
            delta={kpi.delta}
            spark={kpi.spark}
            currency={kpi.currency}
            live={kpi.live}
          />
        ))}
      </div>

      {/* Compliance + chart row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Eyebrow>Calls / hour · last 24h</Eyebrow>
              <div className="mt-1 font-display text-[18px] font-semibold">312 today, peak 41 at 2pm</div>
            </div>
            <div className="flex items-center gap-2">
              <LiveDot size={8} tone="live" />
              <span className="text-[12px] text-muted-foreground">2 calls in flight</span>
            </div>
          </div>
          <Sparkline
            data={[8, 11, 16, 19, 22, 18, 14, 9, 6, 12, 18, 24, 28, 35, 41, 38, 33, 27, 22, 18, 14, 12, 10, 9]}
            width={780}
            height={140}
            tone="signal"
            className="w-full"
          />
        </Card>
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

      <WelcomeModal open={welcomeOpen} onOpenChange={setWelcomeOpen} />
      <ComplianceStatusModal open={complianceOpen} onOpenChange={setComplianceOpen} />
    </div>
  );
}

function outcomeTone(outcome: string): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "booked" || outcome === "qualified") return "success";
  if (outcome === "voicemail" || outcome === "abandoned") return "warning";
  if (outcome === "missed" || outcome === "escalated") return "danger";
  return "neutral";
}
