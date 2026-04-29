import { Button } from "@kuralle/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kuralle/ui/components/collapsible";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Input } from "@kuralle/ui/components/input";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { SheetHeader, SheetTitle } from "@kuralle/ui/components/sheet";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { Tabs, TabsList, TabsTrigger } from "@kuralle/ui/components/tabs";
import { ChevronDown, Mic, Send, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AgentTestDrawerProps {
  agentName: string;
}

interface Turn {
  id: string;
  role: "agent" | "user";
  text: string;
  evalVerdict?: "passed" | "failed" | "warning";
  toolCall?: { name: string; durationMs: number; output: string };
}

const SCRIPT: Turn[] = [
  { id: "t0", role: "agent", text: "Thanks for calling Calderon HVAC, this is your virtual dispatcher — how can I help today?" },
  { id: "t1", role: "user", text: "My furnace stopped heating about an hour ago, it's freezing." },
  {
    id: "t2",
    role: "agent",
    text: "I'm sorry to hear that. What's your zip code?",
    evalVerdict: "passed",
  },
  { id: "t3", role: "user", text: "98103, Wallingford area." },
  {
    id: "t4",
    role: "agent",
    text: "Got it. I have an emergency tech available between 6 and 8 PM. Does that work?",
    evalVerdict: "passed",
    toolCall: {
      name: "service_titan.search_techs",
      durationMs: 312,
      output: '{"availableTechs":2,"earliestEta":"18:42"}',
    },
  },
];

export function AgentTestDrawer({ agentName }: AgentTestDrawerProps) {
  const [mode, setMode] = useState<"type" | "talk">("type");
  const [turns, setTurns] = useState<Turn[]>(SCRIPT.slice(0, 1));
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [turns]);

  function send() {
    if (!input.trim()) return;
    const next = SCRIPT[turns.length];
    if (!next) return;
    setTurns((prev) => [...prev, { ...next, text: input }]);
    setInput("");
    // Simulate the agent's response after a beat.
    const reply = SCRIPT[turns.length + 1];
    if (reply) {
      setTimeout(() => setTurns((prev) => [...prev, reply]), 700);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b">
        <SheetTitle className="font-display text-[18px]">Test {agentName}</SheetTitle>
        <div className="mt-2 flex items-center gap-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "type" | "talk")}>
            <TabsList>
              <TabsTrigger value="type">Type</TabsTrigger>
              <TabsTrigger value="talk">Talk</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
            session · drv_test_{Math.round(Math.random() * 1000)}
          </span>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div ref={scrollerRef} className="flex flex-col gap-3 px-4 py-4">
          {turns.map((t) => (
            <div
              key={t.id}
              className={`flex gap-2 ${t.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`max-w-[80%] rounded-md border px-3 py-2 text-[13px] ${
                  t.role === "agent"
                    ? "bg-card text-foreground"
                    : "bg-primary/10 border-primary/30 text-foreground"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-1.5">
                  <Eyebrow className="text-[10px]">{t.role}</Eyebrow>
                  {t.evalVerdict && (
                    <StatusPill
                      tone={t.evalVerdict === "passed" ? "success" : t.evalVerdict === "warning" ? "warning" : "danger"}
                      hideDot
                      className="px-1.5 py-0 text-[9px]"
                    >
                      eval · {t.evalVerdict}
                    </StatusPill>
                  )}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
                {t.toolCall && (
                  <Collapsible className="mt-2 rounded-md bg-muted px-2 py-1.5">
                    <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Wrench size={11} />
                      <span className="font-mono">{t.toolCall.name}</span>
                      <span className="ml-auto font-mono tabular-nums">
                        {t.toolCall.durationMs}ms
                      </span>
                      <ChevronDown size={11} className="transition data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1.5 font-mono text-[10px] text-foreground">
                      {t.toolCall.output}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t bg-card p-3">
        {mode === "type" ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Type your reply…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <Button onClick={send} className="gap-1">
              <Send size={14} /> Send
            </Button>
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center gap-3 rounded-md border bg-background text-[12px] text-muted-foreground">
            <span className="size-2 rounded-full bg-cyan-500 live-pulse" />
            <Mic size={14} />
            Voice mode is recording. Click again to stop.
          </div>
        )}
      </div>
    </div>
  );
}
