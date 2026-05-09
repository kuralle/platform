import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kuralle/ui/components/collapsible";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { WaveformPlayer } from "@kuralle/ui/components/waveform-player";
import { cn } from "@kuralle/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Pause, Play, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { formatRelative, formatUsd } from "@/lib/format";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import {
  useConversation,
  useConversationLive,
} from "@/hooks/api/conversations";

export const Route = createFileRoute("/_app/conversations/$id/")({
  component: ConversationDetailRoute,
});

function ConversationDetailRoute() {
  const { id } = Route.useParams();
  const workspaceId = useActiveWorkspaceId();
  const conversationQuery = useConversation({
    workspaceId,
    conversationId: id,
  });
  const conversation = conversationQuery.data?.conversation;
  const liveTurns = useConversationLive({
    workspaceId,
    conversationId: id,
    initialTurns: conversationQuery.data?.turns ?? [],
  }).turns;

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);

  const turns = useMemo(() => {
    const toolCalls = conversationQuery.data?.toolCalls ?? [];
    return liveTurns.map((turn) => ({
      id: turn.id,
      speaker: typeof turn.speaker === "string" ? turn.speaker : "agent",
      timestampSec:
        typeof turn.timestampSec === "number" ? turn.timestampSec : 0,
      createdAt:
        typeof turn.createdAt === "string"
          ? turn.createdAt
          : new Date().toISOString(),
      text: typeof turn.text === "string" ? turn.text : "",
      evalVerdict:
        typeof turn.evalVerdict === "string" ? turn.evalVerdict : null,
      toolCalls: toolCalls.filter((toolCall) => toolCall.turnId === turn.id),
    }));
  }, [conversationQuery.data?.toolCalls, liveTurns]);

  const activeTurnId = useMemo(() => {
    let active = turns[0]?.id;
    for (const t of turns) {
      if (t.timestampSec <= position) active = t.id;
    }
    return active;
  }, [turns, position]);

  if (conversationQuery.isLoading || !conversation) {
    return <div className="mx-auto max-w-[960px] px-8 py-6 text-sm text-muted-foreground">Loading conversation...</div>;
  }

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-8 py-6">
      <div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link to="/conversations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft size={12} /> Conversations
          </Link>
          <span>/</span>
          <span className="font-mono tabular-nums text-foreground">{conversation.id}</span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Conversation</Eyebrow>
            <h1 className="mt-1 font-display text-[22px] font-semibold tracking-tight">
              {conversation.participantName ?? conversation.participantId ?? "Unknown caller"} · {conversation.agentId ?? "Unassigned agent"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={conversation.outcome === "booked" ? "success" : "neutral"}>
              {conversation.outcome ?? "live"}
            </StatusPill>
            <Button variant="outline" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause" : "Play"}
            </Button>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <WaveformPlayer
          durationSec={conversation.durationSec ?? 0}
          positionSec={position}
          onSeek={setPosition}
        />
      </Card>

      {/* Compact metadata strip — replaces the old left/right pane sidebars. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Evals" value={`${conversation.evalsPassed}/${conversation.evalsTotal}`} sub="passed" />
        <MetricCard label="Cost" value={formatUsd(conversation.costUsd ?? 0, { precise: true })} sub="this call" />
        <MetricCard label="Caller" value={conversation.participantName ?? "Unknown"} sub={conversation.participantId ?? "—"} mono />
        <MetricCard label="Started" value={formatRelative(conversation.startedAt.toISOString())} sub={conversation.direction ?? "inbound"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <Eyebrow>Extracted fields</Eyebrow>
          <ul className="mt-2 grid gap-1.5 text-[12px]">
            {(conversationQuery.data?.extractedFields ?? []).map((f) => (
              <li key={f.label} className="grid grid-cols-[100px_1fr] gap-3">
                <span className="font-mono text-muted-foreground">{f.label}</span>
                <span className="font-mono">{f.value}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <Eyebrow>Topics</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {conversation.topics.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] uppercase tracking-wide">
                {t}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <Eyebrow>Transcript</Eyebrow>
        <ScrollArea className="mt-3 max-h-[640px]">
          <div className="flex flex-col gap-2">
            {turns.map((turn) => {
              const active = turn.id === activeTurnId;
              return (
                <button
                  key={turn.id}
                  type="button"
                  onClick={() => setPosition(turn.timestampSec)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-md border bg-background p-3 text-left transition",
                    active && "border-primary/60 bg-primary/5",
                    turn.speaker === "caller" && "ml-auto max-w-[85%] bg-muted/60",
                    turn.speaker === "agent" && "mr-auto max-w-[85%]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Eyebrow className="text-[10px]">{turn.speaker}</Eyebrow>
                    <time
                      dateTime={turn.createdAt}
                      title={turn.createdAt}
                      className="font-mono text-[10px] tabular-nums text-muted-foreground"
                    >
                      {formatRelative(turn.createdAt)}
                    </time>
                    {turn.evalVerdict && (
                      <StatusPill
                        tone={turn.evalVerdict === "passed" ? "success" : "warning"}
                        hideDot
                        className="px-1.5 py-0 text-[9px]"
                      >
                        eval · {turn.evalVerdict}
                      </StatusPill>
                    )}
                  </div>
                  <div className="text-[13px] leading-relaxed">{turn.text}</div>
                  {turn.toolCalls?.length ? (
                    <div className="mt-1 grid gap-1">
                      {turn.toolCalls.map((tc) => (
                        <Collapsible
                          key={tc.id}
                          className="rounded-md border border-dashed bg-muted px-2 py-1.5"
                        >
                          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Wrench size={11} />
                            <span className="font-mono">{tc.toolName}</span>
                            <span className="ml-auto font-mono tabular-nums">{tc.durationMs ?? 0}ms</span>
                            <ChevronDown size={11} className="transition data-[state=open]:rotate-180" />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-1.5 grid gap-1 font-mono text-[10px]">
                            <div>
                              <span className="text-muted-foreground">in:</span>{" "}
                              {JSON.stringify(tc.input)}
                            </div>
                            {tc.output != null && (
                              <div>
                                <span className="text-muted-foreground">out:</span>{" "}
                                {JSON.stringify(tc.output)}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className={cn("mt-2 text-[16px] font-semibold", mono && "font-mono text-[14px] tabular-nums")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
