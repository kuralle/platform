import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Input } from "@kuralle/ui/components/input";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { VoicePreviewChip } from "@kuralle/ui/components/voice-preview-chip";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { formatPct, formatRelative, formatUsd } from "@/lib/format";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/")({
  component: AgentsListRoute,
});

type SortKey = "name" | "calls7d" | "bookingRate" | "costPerCall" | "updatedAt";

function AgentsListRoute() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("calls7d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const agents = useMemo(() => makeAgents(10), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? agents.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            a.id.includes(q) ||
            a.llmModel.toLowerCase().includes(q),
        )
      : agents;
    return [...matches].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [agents, query, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Configure"
        title="Agents"
        description="Every agent is a prompt + voice + compliance contract. Click in to tune behaviour, model, or eval criteria."
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-mute-slate" />
              <Input
                placeholder="Search by name or ID"
                className="h-9 w-[260px] pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Button nativeButton={false} render={<Link to="/agents/$agentId/behavior" params={{ agentId: "ag_a00" }} />}>
              <Plus size={16} /> New agent
            </Button>
          </>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader label="Name" active={sortKey === "name"} dir={sortDir} onToggle={() => toggleSort("name")} />
              <TableHead className="w-[140px]">Provider · model</TableHead>
              <TableHead className="w-[180px]">Voice</TableHead>
              <SortHeader
                label="Calls 7d"
                active={sortKey === "calls7d"}
                dir={sortDir}
                onToggle={() => toggleSort("calls7d")}
                align="right"
              />
              <SortHeader
                label="Booking rate"
                active={sortKey === "bookingRate"}
                dir={sortDir}
                onToggle={() => toggleSort("bookingRate")}
                align="right"
              />
              <SortHeader
                label="$ / call"
                active={sortKey === "costPerCall"}
                dir={sortDir}
                onToggle={() => toggleSort("costPerCall")}
                align="right"
              />
              <TableHead className="w-[120px]">Status</TableHead>
              <SortHeader
                label="Updated"
                active={sortKey === "updatedAt"}
                dir={sortDir}
                onToggle={() => toggleSort("updatedAt")}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/agents/$agentId/behavior", params: { agentId: a.id } })}
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-[14px] font-medium">{a.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-mute-slate">{a.id}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wide">
                    {a.llmProvider}
                  </Badge>
                  <div className="mt-0.5 font-mono text-[11px] text-mute-slate">{a.llmModel}</div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <VoicePreviewChip voiceId={a.voiceId} voiceName={a.voiceName} language={a.language} />
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{a.calls7d}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatPct(a.bookingRate)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-receipt-gold">
                  {formatUsd(a.costPerCall, { precise: true })}
                </TableCell>
                <TableCell>
                  <StatusPill tone={a.status === "live" ? "success" : a.status === "draft" ? "neutral" : "warning"}>
                    {a.status}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-right text-[12px] text-mute-slate">{formatRelative(a.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onToggle,
  align,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onToggle: () => void;
  align?: "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute-slate hover:text-foreground"
      >
        {label}
        {active && <ChevronDown size={12} className={dir === "asc" ? "rotate-180" : ""} />}
      </button>
    </TableHead>
  );
}
