import { Badge } from "@kuralle/ui/components/badge";
import { Card } from "@kuralle/ui/components/card";
import { Checkbox } from "@kuralle/ui/components/checkbox";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Input } from "@kuralle/ui/components/input";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { z } from "zod";

import { formatRelative, formatUsd } from "@/lib/format";
import { makeConversations } from "@/mocks";

const ConvSearch = z.object({
  q: z.string().optional().catch(""),
  outcomes: z.array(z.string()).optional().catch([]),
  agents: z.array(z.string()).optional().catch([]),
  liveOnly: z.boolean().optional().catch(false),
});

export const Route = createFileRoute("/_app/conversations/")({
  component: ConversationsList,
  validateSearch: (s) => ConvSearch.parse(s),
});

const FILTER_GROUPS = [
  {
    id: "outcomes",
    label: "Outcome",
    options: ["booked", "qualified", "missed", "voicemail", "abandoned", "escalated"] as const,
  },
  {
    id: "agents",
    label: "Agent",
    options: [
      "Calderon HVAC Inbound",
      "Sundance Plumbing 24/7",
      "Brookline Dental Reminder",
      "Beacon University Admissions",
    ] as const,
  },
];

function ConversationsList() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const conversations = useMemo(() => makeConversations(24), []);

  const filtered = useMemo(() => {
    let rows = conversations;
    if (search.liveOnly) rows = rows.filter((c) => c.isLive);
    if (search.outcomes?.length)
      rows = rows.filter((c) => c.isLive || (search.outcomes as string[]).includes(c.outcome));
    if (search.agents?.length)
      rows = rows.filter((c) => (search.agents as string[]).includes(c.agentName));
    if (search.q) {
      const q = search.q.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.id.toLowerCase().includes(q) ||
          c.callerId.toLowerCase().includes(q) ||
          c.agentName.toLowerCase().includes(q) ||
          (c.callerName ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [conversations, search]);

  function toggle(group: "outcomes" | "agents", value: string) {
    const list = (search[group] as string[] | undefined) ?? [];
    const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
    navigate({ search: { ...search, [group]: next.length ? next : undefined } });
  }

  function clearAll() {
    navigate({ search: {} });
  }

  const activeChips: { id: string; label: string; clear: () => void }[] = [];
  if (search.liveOnly) activeChips.push({ id: "live", label: "Live only", clear: () => navigate({ search: { ...search, liveOnly: undefined } }) });
  (search.outcomes ?? []).forEach((o) =>
    activeChips.push({ id: `o-${o}`, label: o, clear: () => toggle("outcomes", o) }),
  );
  (search.agents ?? []).forEach((a) =>
    activeChips.push({ id: `a-${a}`, label: a, clear: () => toggle("agents", a) }),
  );

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-[240px_1fr] overflow-hidden">
      {/* Sticky filter rail */}
      <aside className="border-r bg-card">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-5 p-4">
            <div>
              <Eyebrow>Filters</Eyebrow>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => navigate({ search: { ...search, liveOnly: !search.liveOnly } })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition",
                    search.liveOnly
                      ? "border-live-cyan/40 bg-live-cyan/8 text-mission-black"
                      : "border-border bg-background hover:border-signal-teal/40",
                  )}
                >
                  <LiveDot size={6} tone="live" static={!search.liveOnly} />
                  Live only
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-mute-slate">2</span>
                </button>
              </div>
            </div>
            {FILTER_GROUPS.map((g) => (
              <div key={g.id}>
                <Eyebrow>{g.label}</Eyebrow>
                <ul className="mt-2 grid gap-1">
                  {g.options.map((opt) => {
                    const checked = ((search[g.id as "outcomes" | "agents"] ?? []) as string[]).includes(opt);
                    return (
                      <li key={opt}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12px] hover:bg-soft-hairline">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(g.id as "outcomes" | "agents", opt)}
                          />
                          <span className="capitalize">{opt}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main pane */}
      <div className="flex flex-col overflow-hidden">
        <div className="border-b bg-card px-6 py-4">
          <PageHeader
            eyebrow="Operate"
            title="Conversations"
            description="URL-persisted filters. Drill into any row for the three-pane review."
            className="pb-0"
            actions={
              <div className="relative w-[320px]">
                <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-mute-slate" />
                <Input
                  placeholder="Search by caller, ID, or agent"
                  className="h-9 pl-8"
                  value={search.q ?? ""}
                  onChange={(e) =>
                    navigate({ search: { ...search, q: e.target.value || undefined } })
                  }
                />
              </div>
            }
          />
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeChips.map((chip) => (
                <Badge
                  key={chip.id}
                  variant="outline"
                  className="gap-1.5 border-signal-teal/30 bg-signal-teal/5 text-signal-teal"
                >
                  {chip.label}
                  <button onClick={chip.clear} aria-label={`Remove ${chip.label}`}>
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              <button onClick={clearAll} className="text-[11px] text-mute-slate hover:text-foreground">
                Clear all
              </button>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          <Card className="m-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">$ / call</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
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
        </ScrollArea>
      </div>
    </div>
  );
}

function outcomeTone(outcome: string): "success" | "warning" | "danger" | "neutral" {
  if (outcome === "booked" || outcome === "qualified") return "success";
  if (outcome === "voicemail" || outcome === "abandoned") return "warning";
  if (outcome === "missed" || outcome === "escalated") return "danger";
  return "neutral";
}
