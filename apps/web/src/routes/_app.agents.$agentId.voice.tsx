import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { Slider } from "@kuralle/ui/components/slider";
import { VoicePreviewChip } from "@kuralle/ui/components/voice-preview-chip";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Globe, Languages } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/voice")({
  component: VoiceTab,
});

const VOICES = [
  { id: "v_aurora", name: "Aurora", language: "en-US", style: "Calm dispatcher" },
  { id: "v_rio", name: "Rio", language: "es-MX", style: "Warm receptionist" },
  { id: "v_hawthorn", name: "Hawthorn", language: "en-GB", style: "Authoritative" },
  { id: "v_lyra", name: "Lyra", language: "en-US", style: "Bright admissions" },
  { id: "v_castor", name: "Castor", language: "en-AU", style: "Confident triage" },
  { id: "v_marin", name: "Marin", language: "fr-CA", style: "Clinical" },
];

function VoiceTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [voiceId, setVoiceId] = useState(seed.voiceId);
  const [pace, setPace] = useState(0.95);
  const [pitch, setPitch] = useState(0);
  const [stability, setStability] = useState(0.7);
  const [warmth, setWarmth] = useState(0.55);
  const [original] = useState({ voiceId: seed.voiceId, pace, pitch, stability, warmth });

  const changes =
    (voiceId !== original.voiceId ? 1 : 0) +
    (pace !== original.pace ? 1 : 0) +
    (pitch !== original.pitch ? 1 : 0) +
    (stability !== original.stability ? 1 : 0) +
    (warmth !== original.warmth ? 1 : 0);

  const multilingual = voiceId !== seed.voiceId &&
    VOICES.find((v) => v.id === voiceId)?.language !== VOICES.find((v) => v.id === seed.voiceId)?.language;

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={() => {
        setVoiceId(original.voiceId);
        setPace(original.pace);
        setPitch(original.pitch);
        setStability(original.stability);
        setWarmth(original.warmth);
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {multilingual && (
          <Alert className="border-compliance-amber/30 bg-compliance-amber/8 text-foreground">
            <Languages />
            <AlertTitle>Switching language requires retraining your eval set.</AlertTitle>
            <AlertDescription>
              The 12 baked English evals will be re-graded against the new language. We'll keep the old ones for diff.
            </AlertDescription>
          </Alert>
        )}

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>Voice library</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Pick a voice</h2>
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] text-mute-slate">
              <Globe size={12} /> 6 multilingual voices
            </span>
          </div>
          <ScrollArea className="mt-4">
            <div className="flex flex-wrap gap-3">
              {VOICES.map((v) => {
                const active = v.id === voiceId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoiceId(v.id)}
                    className={cn(
                      "flex w-[220px] flex-col gap-2 rounded-md border p-3 text-left transition",
                      active ? "border-signal-teal bg-signal-teal/5" : "border-border bg-background hover:border-signal-teal/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-medium">{v.name}</span>
                      <span className="rounded-md bg-audit-indigo/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-audit-indigo">
                        {v.language}
                      </span>
                    </div>
                    <div className="text-[12px] text-mute-slate">{v.style}</div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <VoicePreviewChip voiceId={v.id} voiceName={v.name} language={v.language} />
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-6">
          <Eyebrow>Tuning</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Pace · pitch · stability · warmth</h2>
          <div className="mt-5 grid gap-5">
            {[
              { key: "Pace",      val: pace,      set: setPace,      min: 0.5, max: 1.5, step: 0.05 },
              { key: "Pitch",     val: pitch,     set: setPitch,     min: -1,  max: 1,   step: 0.05 },
              { key: "Stability", val: stability, set: setStability, min: 0,   max: 1,   step: 0.05 },
              { key: "Warmth",    val: warmth,    set: setWarmth,    min: 0,   max: 1,   step: 0.05 },
            ].map((row) => (
              <div key={row.key} className="grid grid-cols-[120px_1fr_60px] items-center gap-4">
                <Field>
                  <FieldLabel>{row.key}</FieldLabel>
                </Field>
                <Slider
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  value={[row.val]}
                  onValueChange={([v]) => v !== undefined && row.set(v)}
                />
                <span className="font-mono text-[13px] tabular-nums">{row.val.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AgentEditorShell>
  );
}
