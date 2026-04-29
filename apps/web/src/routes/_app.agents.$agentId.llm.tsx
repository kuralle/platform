import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Badge } from "@kuralle/ui/components/badge";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { RadioGroup, RadioGroupItem } from "@kuralle/ui/components/radio-group";
import { Slider } from "@kuralle/ui/components/slider";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/llm")({
  component: LlmTab,
});

interface ModelOption {
  id: string;
  label: string;
  capabilities: string[];
  hipaaCompliant: boolean;
  costPer1k: number;
  latencyMs: number;
}

const MODELS: { provider: string; models: ModelOption[] }[] = [
  {
    provider: "Anthropic",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", capabilities: ["1M context", "Tool use", "Vision"], hipaaCompliant: true, costPer1k: 0.015, latencyMs: 540 },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", capabilities: ["200K context", "Tool use"], hipaaCompliant: true, costPer1k: 0.003, latencyMs: 320 },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", capabilities: ["100K context", "Fast"], hipaaCompliant: true, costPer1k: 0.001, latencyMs: 180 },
    ],
  },
  {
    provider: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o", capabilities: ["128K context", "Tool use", "Vision"], hipaaCompliant: false, costPer1k: 0.005, latencyMs: 460 },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", capabilities: ["128K context", "Fast"], hipaaCompliant: false, costPer1k: 0.0006, latencyMs: 240 },
    ],
  },
  {
    provider: "Google",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", capabilities: ["1M context", "Tool use", "Vision"], hipaaCompliant: false, costPer1k: 0.0035, latencyMs: 510 },
    ],
  },
];

function LlmTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [model, setModel] = useState(seed.llmModel);
  const [temperature, setTemperature] = useState(seed.temperature);
  const [original] = useState({ model: seed.llmModel, temperature: seed.temperature });

  const hipaaMode = seed.complianceMode === "hipaa";
  const changes =
    (model !== original.model ? 1 : 0) + (Math.abs(temperature - original.temperature) > 0.001 ? 1 : 0);

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={() => {
        setModel(original.model);
        setTemperature(original.temperature);
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {hipaaMode && (
          <Alert variant="destructive" className="border-amber-500/30 bg-amber-500/8 text-foreground">
            <ShieldAlert />
            <AlertTitle>HIPAA mode is active — model list is filtered.</AlertTitle>
            <AlertDescription>
              Only providers with a signed BAA appear below. To enable additional providers, request a BAA from{" "}
              <span className="underline-offset-2 hover:underline">Workspace → Compliance</span>.
            </AlertDescription>
          </Alert>
        )}

        <Card className="p-6">
          <Eyebrow>Pick a model</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Provider · model · capabilities</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Pricing applies to inference only. Voice costs are billed separately on the Voice tab.
          </p>

          <RadioGroup value={model} onValueChange={setModel} className="mt-4 grid gap-4">
            {MODELS.map((group) => {
              const visible = hipaaMode ? group.models.filter((m) => m.hipaaCompliant) : group.models;
              if (visible.length === 0) return null;
              return (
                <div key={group.provider}>
                  <Eyebrow>{group.provider}</Eyebrow>
                  <div className="mt-2 grid gap-2">
                    {visible.map((m) => (
                      <label
                        key={m.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-4 rounded-md border bg-background p-4 transition",
                          model === m.id && "border-primary/60 bg-primary/5",
                        )}
                      >
                        <RadioGroupItem value={m.id} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-medium">{m.label}</span>
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.id}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {m.capabilities.map((c) => (
                              <Badge key={c} variant="outline" className="text-[10px] uppercase tracking-wide">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-[13px] tabular-nums text-foreground">
                            ${m.costPer1k.toFixed(4)}<span className="text-[10px] text-muted-foreground">/1k tok</span>
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            ~{m.latencyMs}ms
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        </Card>

        <Card className="p-6">
          <Eyebrow>Sampling</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Temperature</h2>
          <div className="mt-5 flex items-center gap-4">
            <span className="font-mono text-[24px] tabular-nums">{temperature.toFixed(2)}</span>
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
