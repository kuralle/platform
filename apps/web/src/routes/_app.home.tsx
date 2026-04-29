import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Sparkline } from "@kuralle/ui/components/sparkline";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ComplianceStatusModal } from "@/components/modals/compliance-status-modal";
import { WelcomeModal } from "@/components/modals/welcome-modal";
import { useWorkspace } from "@/contexts/workspace";
import { formatPct, formatRelative, formatUsd } from "@/lib/format";
import { makeConversations, makeDashboardKpis } from "@/mocks";

export const Route = createFileRoute("/_app/home")({
  component: HomeRoute,
  validateSearch: (s) => ({ welcome: typeof s.welcome === "string" }),
});

function HomeRoute() {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [empty, setEmpty] = useState(false);

  const kpis = useMemo(() => makeDashboardKpis(), []);
  const conversations = useMemo(() => makeConversations(8), []);

  if (empty) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-3xl flex-col items-center justify-center gap-6 px-8 py-16 text-center">
        <div className="grid size-16 place-items-center rounded-full bg-soft-hairline">
          <BookOpen size={28} className="text-mute-slate" />
        </div>
        <div className="grid gap-2">
          <h1 className="font-display text-[28px] font-semibold tracking-tight">
            You don't have an agent yet.
          </h1>
          <p className="max-w-md text-[14px] text-mute-slate">
            Let's build one in 5 minutes. Pick a template, pick a voice, run a test call. It'll
            sound and behave like a real dispatcher in your vertical.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button nativeButton={false} render={<Link to="/agents" />} className="h-11 gap-2 px-5">
            <Plus size={16} /> Build my first agent
          </Button>
          <Button variant="ghost" onClick={() => setEmpty(false)}>
            Show populated home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow={`Workspace · ${workspace.name}`}
        title="Today"
        description={`Live activity, recent calls, and compliance posture for ${formatRelative(new Date().toISOString()).replace(" ago", "")}.`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setEmpty(true)}>Show empty state</Button>
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
              <span className="text-[12px] text-mute-slate">2 calls in flight</span>
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
              state={workspace.compliance.hipaa}
              suffix={workspace.compliance.hipaa === "inactive" ? "not in scope" : undefined}
            />
            <ComplianceChip label="FERPA" state={workspace.compliance.ferpa} suffix="not in scope" />
            <ComplianceChip label="TCPA" state={workspace.compliance.tcpa} suffix="PEWC + DNC ✓" />
            <ComplianceChip label="EU AI Act" state={workspace.compliance.euAiAct} suffix="risk class needed" />
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
      <Card className="mt-6">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <Eyebrow>Recent conversations</Eyebrow>
            <div className="mt-1 font-display text-[16px] font-semibold">Last 90 minutes</div>
          </div>
          <Button nativeButton={false} render={<Link to="/conversations" />} variant="ghost" className="h-8 px-2 text-[12px]">
            Open all →
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">ID</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Started</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.slice(0, 6).map((c) => (
              <TableRow
                key={c.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({
                    to: c.isLive ? "/conversations/$id/live" : "/conversations/$id",
                    params: { id: c.id },
                  })
                }
              >
                <TableCell className="font-mono text-[12px] tabular-nums">
                  <div className="flex items-center gap-2">
                    {c.isLive && <LiveDot size={6} tone="live" />}
                    {c.id}
                  </div>
                </TableCell>
                <TableCell className="text-[13px]">{c.agentName}</TableCell>
                <TableCell className="text-[13px]">
                  <div className="flex flex-col">
                    <span className="font-mono tabular-nums">{c.callerId}</span>
                    {c.callerName && <span className="text-[11px] text-mute-slate">{c.callerName}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  {c.isLive ? (
                    <StatusPill tone="live">Live · {c.direction}</StatusPill>
                  ) : (
                    <StatusPill tone={outcomeTone(c.outcome)}>{c.outcome}</StatusPill>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-[12px] tabular-nums">
                  {Math.floor(c.durationSec / 60)}:{String(c.durationSec % 60).padStart(2, "0")}
                </TableCell>
                <TableCell className="text-right font-mono text-[12px] tabular-nums text-receipt-gold">
                  {formatUsd(c.costUsd, { precise: true })}
                </TableCell>
                <TableCell className="text-right text-[12px] text-mute-slate">
                  {formatRelative(c.startedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
