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

import { useEditor } from "@/contexts/editor";
import { useTestTurn } from "@/hooks/api/agents";

interface AgentTestDrawerProps {
  agentName: string;
  agentId: string;
  workspaceId: string;
}

interface Turn {
  id: string;
  role: "agent" | "user";
  text: string;
  toolCall?: { name: string; durationMs: number; output: string };
}

export function AgentTestDrawer({ agentName, agentId, workspaceId }: AgentTestDrawerProps) {
  const { state } = useEditor();
  const testTurn = useTestTurn();
  const [mode, setMode] = useState<"type" | "talk">("type");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [turns, errorMessage, testTurn.isPending]);

  async function send() {
    const text = input.trim();
    if (!text || testTurn.isPending) return;

    setErrorMessage(null);
    setTurns((prev) => [
      ...prev,
      { id: `user_${prev.length}`, role: "user", text },
    ]);
    setInput("");

    try {
      const result = await testTurn.mutateAsync({
        workspaceId,
        agentId,
        ir: state.ir,
        input: text,
        sessionId: sessionId ?? undefined,
      });
      setSessionId(result.sessionId);
      setTurns((prev) => [
        ...prev,
        {
          id: `agent_${prev.length}`,
          role: "agent",
          text: result.reply,
          toolCall: result.toolCalls[0]
            ? {
                name: result.toolCalls[0].name,
                durationMs: 0,
                output: JSON.stringify(result.toolCalls),
              }
            : undefined,
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Test turn failed";
      setErrorMessage(message);
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
            session · {sessionId ?? "new"}
          </span>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div ref={scrollerRef} className="flex flex-col gap-3 px-4 py-4">
          {turns.length === 0 && !errorMessage && (
            <p className="text-[13px] text-muted-foreground">
              Send a message to run the draft agent — no publish required.
            </p>
          )}
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
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
                {t.toolCall && (
                  <Collapsible className="mt-2 rounded-md bg-muted px-2 py-1.5">
                    <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Wrench size={11} />
                      <span className="font-mono">{t.toolCall.name}</span>
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
          {testTurn.isPending && (
            <div className="flex gap-2">
              <div className="max-w-[80%] rounded-md border bg-card px-3 py-2 text-[13px] text-muted-foreground">
                <Eyebrow className="text-[10px]">agent</Eyebrow>
                <div className="mt-1">Thinking…</div>
              </div>
            </div>
          )}
          {errorMessage && (
            <StatusPill tone="danger" className="self-start">
              {errorMessage}
            </StatusPill>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-card p-3">
        {mode === "type" ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Type your reply…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={testTurn.isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
            />
            <Button onClick={() => void send()} className="gap-1" disabled={testTurn.isPending}>
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
