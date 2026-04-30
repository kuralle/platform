import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { makeAgents } from "@/mocks";
import type { PipelineMode, ReasoningEffort } from "@/types/domain";

export const Route = createFileRoute("/_app/agents/$agentId/models")({
  component: ModelsTab,
});

// ---------- option catalogs ----------------------------------------------

const TTS_MODELS = [
  { id: "cartesia-sonic-3",      label: "Cartesia Sonic 3",       brand: "C" },
  { id: "elevenlabs-flash-v2.5", label: "ElevenLabs Flash v2.5",  brand: "E" },
  { id: "elevenlabs-v3",         label: "ElevenLabs v3 Conversational", brand: "E" },
  { id: "openai-tts-1-hd",       label: "OpenAI TTS-1 HD",        brand: "O" },
];

const TTS_VOICES = [
  { id: "v_aurora",  name: "Aurora",  language: "en-US" },
  { id: "v_jacqueline", name: "Jacqueline", language: "en-US" },
  { id: "v_rio",     name: "Rio",     language: "es-MX" },
  { id: "v_hawthorn",name: "Hawthorn",language: "en-GB" },
  { id: "v_lyra",    name: "Lyra",    language: "en-US" },
  { id: "v_castor",  name: "Castor",  language: "en-AU" },
  { id: "v_marin",   name: "Marin",   language: "fr-CA" },
];

const LLM_MODELS = [
  { id: "claude-opus-4-7",   label: "Claude Opus 4.7",   brand: "A" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", brand: "A" },
  { id: "claude-haiku-4-5",  label: "Claude Haiku 4.5",  brand: "A" },
  { id: "gpt-4o",            label: "OpenAI GPT-4o",     brand: "O" },
  { id: "gpt-4o-mini",       label: "OpenAI GPT-4o Mini", brand: "O" },
  { id: "o1-mini",           label: "OpenAI o1-mini",    brand: "O" },
  { id: "gemini-2.5-pro",    label: "Gemini 2.5 Pro",    brand: "G" },
  { id: "gemini-2.5-flash",  label: "Gemini 2.5 Flash",  brand: "G" },
];

const STT_MODELS = [
  { id: "deepgram-nova-3-monolingual", label: "Deepgram Nova-3 (Monolingual)", brand: "D" },
  { id: "deepgram-nova-3-multilingual", label: "Deepgram Nova-3 (Multilingual)", brand: "D" },
  { id: "elevenlabs-scribe-v2",        label: "ElevenLabs Scribe v2 Realtime",  brand: "E" },
  { id: "openai-whisper-3",            label: "OpenAI Whisper 3",               brand: "O" },
];

const STT_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "auto", label: "Auto-detect" },
];

interface RealtimeModel {
  id: string;
  label: string;
  brand: string;
  /** Realtime providers that need a customer-supplied API key. */
  byokSecret?: string;
}

const REALTIME_MODELS: RealtimeModel[] = [
  { id: "openai-realtime-2026-04", label: "OpenAI Realtime (2026-04)", brand: "O", byokSecret: "OPENAI_API_KEY" },
  { id: "google-gemini-live-2-5",  label: "Google Gemini Live 2.5",    brand: "G" },
  { id: "xai-grok-voice-agent",    label: "xAI Grok Voice Agent API",  brand: "X", byokSecret: "XAI_API_KEY" },
  { id: "elevenlabs-convai",       label: "ElevenLabs ConvAI Realtime", brand: "E" },
];

const NOISE_CANCELLATION = ["None", "Quail VF L", "Krisp", "RNNoise"];
const BACKGROUND_AUDIO = ["None", "Office ambience", "Cafe", "Outdoors", "Call-center floor"];

// ---------- the tab ------------------------------------------------------

function ModelsTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [pipelineMode, setPipelineMode] = useState<PipelineMode>(seed.pipelineMode);

  // STT-LLM-TTS pipeline state
  const [llmModel, setLlmModel] = useState(seed.llmModel);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(seed.reasoningEffort);
  const [ttsModel, setTtsModel] = useState(seed.tts.model);
  const [ttsVoiceId, setTtsVoiceId] = useState(seed.tts.voiceId);
  const [sttModel, setSttModel] = useState(seed.stt.model);
  const [sttLanguage, setSttLanguage] = useState(seed.stt.language);

  // Realtime state
  const [realtimeModel, setRealtimeModel] = useState(seed.realtime.model);
  const [realtimeVoiceId, setRealtimeVoiceId] = useState(seed.realtime.voiceId);

  // Always-visible audio state
  const [noiseCancellation, setNoiseCancellation] = useState(seed.noiseCancellation);
  const [backgroundAudio, setBackgroundAudio] = useState(seed.backgroundAudio);

  const [original] = useState({
    pipelineMode: seed.pipelineMode,
    llmModel: seed.llmModel,
    reasoningEffort: seed.reasoningEffort,
    ttsModel: seed.tts.model,
    ttsVoiceId: seed.tts.voiceId,
    sttModel: seed.stt.model,
    sttLanguage: seed.stt.language,
    realtimeModel: seed.realtime.model,
    realtimeVoiceId: seed.realtime.voiceId,
    noiseCancellation: seed.noiseCancellation,
    backgroundAudio: seed.backgroundAudio,
  });

  const changes =
    (pipelineMode !== original.pipelineMode ? 1 : 0) +
    (llmModel !== original.llmModel ? 1 : 0) +
    (reasoningEffort !== original.reasoningEffort ? 1 : 0) +
    (ttsModel !== original.ttsModel ? 1 : 0) +
    (ttsVoiceId !== original.ttsVoiceId ? 1 : 0) +
    (sttModel !== original.sttModel ? 1 : 0) +
    (sttLanguage !== original.sttLanguage ? 1 : 0) +
    (realtimeModel !== original.realtimeModel ? 1 : 0) +
    (realtimeVoiceId !== original.realtimeVoiceId ? 1 : 0) +
    (noiseCancellation !== original.noiseCancellation ? 1 : 0) +
    (backgroundAudio !== original.backgroundAudio ? 1 : 0);

  function reset() {
    setPipelineMode(original.pipelineMode);
    setLlmModel(original.llmModel);
    setReasoningEffort(original.reasoningEffort);
    setTtsModel(original.ttsModel);
    setTtsVoiceId(original.ttsVoiceId);
    setSttModel(original.sttModel);
    setSttLanguage(original.sttLanguage);
    setRealtimeModel(original.realtimeModel);
    setRealtimeVoiceId(original.realtimeVoiceId);
    setNoiseCancellation(original.noiseCancellation);
    setBackgroundAudio(original.backgroundAudio);
  }

  const ttsVoice = TTS_VOICES.find((v) => v.id === ttsVoiceId) ?? TTS_VOICES[0]!;
  const realtimeVoice = TTS_VOICES.find((v) => v.id === realtimeVoiceId) ?? TTS_VOICES[0]!;
  const realtimeModelDef = REALTIME_MODELS.find((m) => m.id === realtimeModel);

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={reset}
    >
      <div className="grid gap-8">
        <section>
          <Eyebrow>Pipeline mode</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Choose how this agent processes conversations</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ModeCard
              active={pipelineMode === "stt-llm-tts"}
              title="STT-LLM-TTS pipeline"
              description="Configure your STT, LLM, and TTS options separately. Best price / quality trade-offs and full control."
              onSelect={() => setPipelineMode("stt-llm-tts")}
            />
            <ModeCard
              active={pipelineMode === "realtime"}
              title="Realtime model"
              description="Use a single multimodal model for both reasoning and voice. Lowest latency."
              onSelect={() => setPipelineMode("realtime")}
            />
          </div>
        </section>

        {pipelineMode === "stt-llm-tts" ? (
          <>
            <section>
              <Eyebrow>Text-to-speech (TTS)</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Speech the agent produces</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Converts the agent's text response into speech using the selected voice.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Model</FieldLabel>
                  <Select value={ttsModel} onValueChange={setTtsModel}>
                    <SelectTrigger className="h-10">
                      <BrandedValue brand={TTS_MODELS.find((m) => m.id === ttsModel)?.brand}>
                        <SelectValue />
                      </BrandedValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Voice</FieldLabel>
                  <Select value={ttsVoiceId} onValueChange={setTtsVoiceId}>
                    <SelectTrigger className="h-10">
                      <span className="flex items-center gap-2">
                        <span className="text-[14px] font-medium">{ttsVoice.name}</span>
                        <span className="text-[11px] text-muted-foreground">{ttsVoice.language}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_VOICES.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <span className="flex items-center gap-2">
                            {v.name}
                            <span className="text-[11px] text-muted-foreground">{v.language}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section>
              <Eyebrow>Large language model (LLM)</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">The agent's brain</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Generates responses, follows the system prompt, and uses tools.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Model</FieldLabel>
                  <Select value={llmModel} onValueChange={setLlmModel}>
                    <SelectTrigger className="h-10">
                      <BrandedValue brand={LLM_MODELS.find((m) => m.id === llmModel)?.brand}>
                        <SelectValue />
                      </BrandedValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LLM_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Reasoning effort</FieldLabel>
                  <Select
                    value={reasoningEffort}
                    onValueChange={(v) => setReasoningEffort(v as ReasoningEffort)}
                  >
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (fastest, cheapest)</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High (deepest, most expensive)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>

            <section>
              <Eyebrow>Speech-to-text (STT)</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">What the caller says</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Transcribes the user's speech into text for input to the LLM.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
                <Field>
                  <FieldLabel>Model</FieldLabel>
                  <Select value={sttModel} onValueChange={setSttModel}>
                    <SelectTrigger className="h-10">
                      <BrandedValue brand={STT_MODELS.find((m) => m.id === sttModel)?.brand}>
                        <SelectValue />
                      </BrandedValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STT_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Language</FieldLabel>
                  <Select value={sttLanguage} onValueChange={setSttLanguage}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STT_LANGUAGES.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>
          </>
        ) : (
          <>
            {realtimeModelDef?.byokSecret && (
              <Alert className="border-amber-500/30 bg-amber-500/8 text-foreground">
                <ShieldAlert />
                <AlertTitle>This model requires you to bring your own API key.</AlertTitle>
                <AlertDescription>
                  Make sure the <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px]">{realtimeModelDef.byokSecret}</span>{" "}
                  secret is set under <strong>Workspace → Settings → Security</strong> before saving.
                </AlertDescription>
              </Alert>
            )}

            <section>
              <Eyebrow>Realtime model</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Single model for reasoning and voice</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                The AI model that handles both conversation and voice generation in one round trip.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Model</FieldLabel>
                  <Select value={realtimeModel} onValueChange={setRealtimeModel}>
                    <SelectTrigger className="h-10">
                      <BrandedValue brand={REALTIME_MODELS.find((m) => m.id === realtimeModel)?.brand}>
                        <SelectValue />
                      </BrandedValue>
                    </SelectTrigger>
                    <SelectContent>
                      {REALTIME_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            {m.label}
                            {m.byokSecret && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-amber-700">
                                BYOK
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Voice</FieldLabel>
                  <Select value={realtimeVoiceId} onValueChange={setRealtimeVoiceId}>
                    <SelectTrigger className="h-10">
                      <span className="flex items-center gap-2">
                        <span className="text-[14px] font-medium">{realtimeVoice.name}</span>
                        <span className="text-[11px] text-muted-foreground">{realtimeVoice.language}</span>
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_VOICES.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          <span className="flex items-center gap-2">
                            {v.name}
                            <span className="text-[11px] text-muted-foreground">{v.language}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </section>
          </>
        )}

        {/* Hidden until we wire the audio pipeline.
        <section>
          <Eyebrow>Noise cancellation</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Clean up the caller's audio</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Reduces background noise in the user's audio input for clearer conversations.
          </p>
          <Field className="mt-4 max-w-md">
            <FieldLabel className="sr-only">Noise cancellation engine</FieldLabel>
            <Select value={noiseCancellation} onValueChange={setNoiseCancellation}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {NOISE_CANCELLATION.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </section>

        <section>
          <Eyebrow>Background audio</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Optional ambience</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Plays under the agent so silence doesn't feel like a dead line.
          </p>
          <Field className="mt-4 max-w-md">
            <FieldLabel className="sr-only">Background audio</FieldLabel>
            <Select value={backgroundAudio} onValueChange={setBackgroundAudio}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BACKGROUND_AUDIO.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </section>
        */}
      </div>
    </AgentEditorShell>
  );
}

// ---------- subcomponents -----------------------------------------------

function ModeCard({
  active,
  title,
  description,
  onSelect,
}: {
  active: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "cursor-pointer p-4 transition",
        active ? "border-primary bg-primary/5" : "hover:border-primary/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-semibold">{title}</div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <span
          className={cn(
            "mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2",
            active ? "border-primary" : "border-border",
          )}
        >
          {active && <span className="size-1.5 rounded-full bg-primary" />}
        </span>
      </div>
    </Card>
  );
}

function BrandedValue({ brand, children }: { brand?: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      {brand && (
        <span className="grid size-5 shrink-0 place-items-center rounded bg-muted font-mono text-[10px] font-semibold text-muted-foreground">
          {brand}
        </span>
      )}
      {children}
    </span>
  );
}
