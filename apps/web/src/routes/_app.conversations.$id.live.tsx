import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Input } from "@kuralle/ui/components/input";
import { LiveDot } from "@kuralle/ui/components/live-dot";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { WaveformPlayer } from "@kuralle/ui/components/waveform-player";
import { cn } from "@kuralle/ui/lib/utils";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  Hand,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  Siren,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatDuration } from "@/lib/format";
import { makeConversations } from "@/mocks";

export const Route = createFileRoute("/_app/conversations/$id/live")({
  component: LiveSupervisorRoute,
});

function LiveSupervisorRoute() {
  const { id } = Route.useParams();
  const conversations = useMemo(() => makeConversations(24), []);
  const conversation = useMemo(
    () => conversations.find((c) => c.id === id) ?? conversations[0]!,
    [conversations, id],
  );
  const [elapsed, setElapsed] = useState(72);
  const [transcript, setTranscript] = useState(conversation.transcript.slice(0, 4));
  const [composer, setComposer] = useState("");
  const [muted, setMuted] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const audit = useRef<{ at: string; event: string }[]>([
    { at: "00:00", event: "Call connected · agent answered" },
    { at: "00:14", event: "Tool call · service_titan.search_techs (312ms)" },
    { at: "00:42", event: "Eval · ‹passed› identification turn" },
    { at: "01:08", event: "Disclosure read · TCPA recording" },
  ]);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  function injectAgent() {
    setTranscript((prev) => [
      ...prev,
      {
        id: `live-${prev.length}`,
        speaker: "agent",
        text: composer || "Stand by — checking my notes.",
        timestampSec: elapsed,
      },
    ]);
    audit.current.push({ at: formatDuration(elapsed), event: "Operator injected agent turn" });
    setComposer("");
  }

  function takeover() {
    audit.current.push({ at: formatDuration(elapsed), event: "Human takeover initiated" });
    setTranscript((prev) => [
      ...prev,
      {
        id: `live-${prev.length}`,
        speaker: "agent",
        text: "[Operator has joined the line.]",
        timestampSec: elapsed,
      },
    ]);
  }

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-rows-[auto_1fr] bg-background text-foreground">
      <div className="border-b border-border bg-background px-6 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Link to="/conversations" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft size={12} /> Conversations
          </Link>
          <span>/</span>
          <span className="font-mono tabular-nums text-foreground">{conversation.id}</span>
          <span>·</span>
          <span>Mission control</span>
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Eyebrow className="text-cyan-500">Live</Eyebrow>
              <LiveDot size={8} tone="live" />
              <span className="font-mono text-[14px] tabular-nums text-muted-foreground">
                {formatDuration(elapsed)}
              </span>
            </div>
            <h1 className="mt-1 font-display text-[20px] font-semibold tracking-tight">
              {conversation.callerName ?? conversation.callerId} · {conversation.agentName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone="live">Live · {conversation.direction}</StatusPill>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_320px] overflow-hidden">
        <div className="flex flex-col overflow-hidden border-r border-border">
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-2 p-5">
              {transcript.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-md border border-border bg-card p-3",
                    t.speaker === "caller" && "ml-auto max-w-[80%] bg-card/60",
                    t.speaker === "agent" && "mr-auto max-w-[80%]",
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Eyebrow className="text-[10px] text-muted-foreground">{t.speaker}</Eyebrow>
                    <span className="font-mono tabular-nums">{formatDuration(t.timestampSec)}</span>
                  </div>
                  <div className="text-[13px] leading-relaxed text-foreground">{t.text}</div>
                </div>
              ))}
              <div className="ml-auto flex items-center gap-2 self-start text-[11px] text-muted-foreground">
                <LiveDot size={6} tone="live" />
                streaming…
              </div>
            </div>
          </ScrollArea>

          <div className="border-t border-border bg-background p-4">
            <WaveformPlayer
              durationSec={Math.max(elapsed + 5, 60)}
              positionSec={elapsed}
              onSeek={() => undefined}
              live
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ToolButton
                icon={muted ? MicOff : Mic}
                label={muted ? "Unmute caller" : "Mute caller"}
                onClick={() => setMuted((m) => !m)}
              />
              <ToolButton
                icon={audioOn ? Volume2 : VolumeOff}
                label={audioOn ? "Mute audio" : "Unmute audio"}
                onClick={() => setAudioOn((a) => !a)}
              />
              <ToolButton icon={Hand} label="Whisper" />
              <ToolButton icon={PhoneCall} label="Bridge to operator" onClick={takeover} />
              <ToolButton icon={Siren} label="Panic · escalate" tone="danger" />
              <ToolButton icon={PhoneOff} label="End call" tone="danger" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                placeholder="Inject text for the agent to read…"
                className="h-9 border-border bg-card text-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") injectAgent();
                }}
              />
              <Button onClick={injectAgent} className="gap-1">
                <Send size={14} /> Inject
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea>
          <div className="flex flex-col gap-4 p-5">
            <Card className="border-border bg-card p-4">
              <Eyebrow className="text-muted-foreground">Caller</Eyebrow>
              <div className="mt-2 grid gap-1 text-[13px]">
                <div className="font-medium">{conversation.callerName ?? "Unknown"}</div>
                <div className="font-mono text-[12px] tabular-nums text-muted-foreground">{conversation.callerId}</div>
              </div>
              <Button variant="destructive" className="mt-4 w-full gap-2 bg-destructive/15 text-destructive hover:bg-destructive/30">
                <Siren size={14} /> Panic
              </Button>
            </Card>
            <Card className="border-border bg-card p-4">
              <Eyebrow className="text-muted-foreground">Audit log</Eyebrow>
              <ul className="mt-2 grid gap-1.5 font-mono text-[11px] tabular-nums">
                {audit.current.map((row, i) => (
                  <li key={i} className="grid grid-cols-[44px_1fr] gap-3 text-muted-foreground">
                    <span>{row.at}</span>
                    <span className="text-foreground">{row.event}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick?: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[12px] text-foreground transition hover:border-primary/50 hover:bg-card/60",
        tone === "danger" && "border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10",
      )}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}
