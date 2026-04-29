import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kuralle/ui/components/collapsible";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@kuralle/ui/components/resizable";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { WaveformPlayer } from "@kuralle/ui/components/waveform-player";
import { cn } from "@kuralle/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Pause, Play, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { formatDuration, formatRelative, formatUsd } from "@/lib/format";
import { makeConversations } from "@/mocks";

export const Route = createFileRoute("/_app/conversations/$id/")({
  component: ConversationDetailRoute,
});

function ConversationDetailRoute() {
  const { id } = Route.useParams();
  const conversations = useMemo(() => makeConversations(24), []);
  const conversation = useMemo(() => conversations.find((c) => c.id === id) ?? conversations[0]!, [conversations, id]);

  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);

  const activeTurnId = useMemo(() => {
    let active = conversation.transcript[0]?.id;
    for (const t of conversation.transcript) {
      if (t.timestampSec <= position) active = t.id;
    }
    return active;
  }, [conversation.transcript, position]);

  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="border-b bg-card px-6 py-3">
        <div className="flex items-center gap-2 text-[12px] text-mute-slate">
          <Link to="/conversations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft size={12} /> Conversations
          </Link>
          <span>/</span>
          <span className="font-mono tabular-nums text-foreground">{conversation.id}</span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Conversation</Eyebrow>
            <h1 className="mt-1 font-display text-[20px] font-semibold tracking-tight">
              {conversation.callerName ?? conversation.callerId} · {conversation.agentName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={conversation.outcome === "booked" ? "success" : "neutral"}>
              {conversation.outcome}
            </StatusPill>
            <Button variant="outline" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause" : "Play"}
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <WaveformPlayer
            durationSec={conversation.durationSec}
            positionSec={position}
            onSeek={setPosition}
          />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={50} minSize={30}>
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-2 p-6">
                {conversation.transcript.map((turn) => {
                  const active = turn.id === activeTurnId;
                  return (
                    <button
                      key={turn.id}
                      type="button"
                      onClick={() => setPosition(turn.timestampSec)}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-md border bg-background p-3 text-left transition",
                        active && "border-signal-teal/60 bg-signal-teal/5",
                        turn.speaker === "caller" && "ml-auto max-w-[85%] bg-soft-hairline/60",
                        turn.speaker === "agent" && "mr-auto max-w-[85%]",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Eyebrow className="text-[10px]">{turn.speaker}</Eyebrow>
                        <span className="font-mono text-[10px] tabular-nums text-mute-slate">
                          {formatDuration(turn.timestampSec)}
                        </span>
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
                              className="rounded-md border border-dashed bg-soft-hairline px-2 py-1.5"
                            >
                              <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[11px] text-mute-slate">
                                <Wrench size={11} />
                                <span className="font-mono">{tc.name}</span>
                                <span className="ml-auto font-mono tabular-nums">{tc.durationMs}ms</span>
                                <ChevronDown size={11} className="transition data-[state=open]:rotate-180" />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-1.5 grid gap-1 font-mono text-[10px]">
                                <div>
                                  <span className="text-mute-slate">in:</span>{" "}
                                  {JSON.stringify(tc.input)}
                                </div>
                                {tc.output && (
                                  <div>
                                    <span className="text-mute-slate">out:</span>{" "}
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
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={25} minSize={20}>
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-4 p-5">
                <Card className="p-4">
                  <Eyebrow>Evals · this call</Eyebrow>
                  <div className="mt-2 font-mono text-[24px] tabular-nums">
                    {conversation.evalsPassed}/{conversation.evalsTotal}
                  </div>
                  <div className="mt-1 text-[12px] text-mute-slate">passed</div>
                </Card>
                <Card className="p-4">
                  <Eyebrow>Extracted fields</Eyebrow>
                  <ul className="mt-2 grid gap-1.5 text-[12px]">
                    {conversation.extractedFields.map((f) => (
                      <li key={f.label} className="grid grid-cols-[100px_1fr] gap-3">
                        <span className="font-mono text-mute-slate">{f.label}</span>
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
            </ScrollArea>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={25} minSize={18}>
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-4 p-5">
                <Card className="p-4">
                  <Eyebrow>Caller</Eyebrow>
                  <div className="mt-2 grid gap-1 text-[13px]">
                    <div className="font-medium">{conversation.callerName ?? "Unknown"}</div>
                    <div className="font-mono text-[12px] tabular-nums">{conversation.callerId}</div>
                    <div className="text-[12px] text-mute-slate">Started {formatRelative(conversation.startedAt)}</div>
                  </div>
                </Card>
                <Card className="p-4">
                  <Eyebrow>Cost</Eyebrow>
                  <div className="mt-2 font-mono text-[20px] tabular-nums text-receipt-gold">
                    {formatUsd(conversation.costUsd, { precise: true })}
                  </div>
                  <div className="mt-0.5 text-[12px] text-mute-slate">total · this call</div>
                </Card>
                <Card className="p-4">
                  <Eyebrow>Direction</Eyebrow>
                  <div className="mt-2">
                    <StatusPill tone="info">{conversation.direction}</StatusPill>
                  </div>
                </Card>
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
