import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Slider } from "@kuralle/ui/components/slider";
import { Textarea } from "@kuralle/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@kuralle/ui/components/tooltip";
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/behavior")({
  component: BehaviorTab,
});

function BehaviorTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [firstMessage, setFirstMessage] = useState(seed.firstMessage);
  const [systemPrompt, setSystemPrompt] = useState(seed.systemPrompt);
  const [temperature, setTemperature] = useState(seed.temperature);
  const [originalSnapshot] = useState({
    firstMessage: seed.firstMessage,
    systemPrompt: seed.systemPrompt,
    temperature: seed.temperature,
  });

  const changes =
    (firstMessage !== originalSnapshot.firstMessage ? 1 : 0) +
    (systemPrompt !== originalSnapshot.systemPrompt ? 1 : 0) +
    (Math.abs(temperature - originalSnapshot.temperature) > 0.001 ? 1 : 0);

  function reset() {
    setFirstMessage(originalSnapshot.firstMessage);
    setSystemPrompt(originalSnapshot.systemPrompt);
    setTemperature(originalSnapshot.temperature);
  }

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={reset}
    >
      <div className="mx-auto grid max-w-3xl gap-6">
        <Card className="p-6">
          <Eyebrow>First message</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">
            What does the agent say when the call connects?
          </h2>
          <p className="mt-1 text-[13px] text-mute-slate">
            Keep it under 18 words. Lead with brand + action so the caller knows where they landed.
          </p>
          <Field className="mt-4">
            <FieldLabel htmlFor="first-message">First message</FieldLabel>
            <Input
              id="first-message"
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
            />
          </Field>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>System prompt</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Behaviour contract</h2>
            </div>
            <span className="font-mono text-[12px] tabular-nums text-mute-slate">
              {systemPrompt.length.toLocaleString()} chars · ~{Math.ceil(systemPrompt.length / 4).toLocaleString()} tokens
            </span>
          </div>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="mt-4 min-h-[260px] font-mono text-[13px]"
          />
          <div className="mt-3 flex items-center justify-between text-[12px] text-mute-slate">
            <span>Markdown supported. Tool calls reference your enabled tools.</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                    <Info size={12} /> Cost preview
                  </Button>
                }
              />
              <TooltipContent>
                ≈ <span className="font-mono tabular-nums text-receipt-gold">$0.024</span> per turn at this length, current model.
              </TooltipContent>
            </Tooltip>
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>Sampling</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Temperature</h2>
          <p className="mt-1 text-[13px] text-mute-slate">
            Lower is consistent. Higher is conversational. We recommend 0.4 for ops-style agents.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <span className="font-mono text-[24px] tabular-nums text-foreground">{temperature.toFixed(2)}</span>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[temperature]}
              onValueChange={([v]) => v !== undefined && setTemperature(v)}
              className="flex-1"
            />
          </div>
        </Card>
      </div>
    </AgentEditorShell>
  );
}
