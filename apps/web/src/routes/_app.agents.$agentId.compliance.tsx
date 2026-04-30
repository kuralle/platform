import { Badge } from "@kuralle/ui/components/badge";
import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Slider } from "@kuralle/ui/components/slider";
import { Switch } from "@kuralle/ui/components/switch";
import { Textarea } from "@kuralle/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@kuralle/ui/components/toggle-group";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/compliance")({
  component: ComplianceTab,
});

const REQUIREMENTS_BY_MODE: Record<string, { id: string; label: string; description: string }[]> = {
  none: [],
  hipaa: [
    { id: "baa", label: "BAA on file", description: "Signed Business Associate Agreement with the LLM provider." },
    { id: "zrm", label: "Zero retention mode", description: "Provider retains no transcript, prompt, or tool outputs." },
    { id: "redact", label: "ePHI redaction at rest", description: "Auto-redact name, DOB, MRN before persistence." },
    { id: "audit", label: "Audit trail ≥ 6 yrs", description: "All access events written to append-only log." },
    { id: "iv", label: "Identity verification on transcript export", description: "Force re-auth before any export action." },
    { id: "training", label: "BA personnel training current", description: "Operator team has annual HIPAA training on file." },
  ],
  ferpa: [
    { id: "consent", label: "Educational record consent", description: "Caller consents to discussing record on first turn." },
    { id: "iv", label: "Identity-verification gate", description: "Confirm DOB + last 4 of student ID before disclosure." },
    { id: "directory", label: "Directory-info disclosure script", description: "Read disclosure if directory info will be shared." },
    { id: "annual", label: "Annual notification on file", description: "Workspace has uploaded the institution's annual notice." },
    { id: "logs", label: "Parent / eligible-student access logs", description: "Every disclosure event is logged with caller identity." },
    { id: "minor", label: "Minor handling rules applied", description: "Special handling when caller is under 18." },
  ],
  tcpa: [
    { id: "pewc", label: "PEWC consent for outbound", description: "Prior Express Written Consent on file per recipient." },
    { id: "dnc", label: "DNC scrub on schedule", description: "National + internal DNC scrub before every batch." },
    { id: "window", label: "Time-of-day window enforced", description: "Outbound only between 8am and 9pm in recipient's timezone." },
    { id: "stop", label: "STOP keyword parsed", description: "Inbound STOP / UNSUBSCRIBE keywords trigger opt-out." },
    { id: "callerid", label: "Caller-ID matches registered", description: "Outbound calls present a registered, owned number." },
    { id: "footer", label: "Disclosure footer on every turn", description: '"This call may be recorded" announced + logged.' },
  ],
};

function ComplianceTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [mode, setMode] = useState<"none" | "hipaa" | "ferpa" | "tcpa">(seed.complianceMode);
  const [retentionDays, setRetentionDays] = useState(90);
  const [disclosureEnabled, setDisclosureEnabled] = useState(true);
  const [disclosureScript, setDisclosureScript] = useState(
    "Hi, this is an AI dispatcher for Calderon HVAC. This call is recorded for quality and may be used to schedule service.",
  );
  const [redactionChips, setRedactionChips] = useState<string[]>(["DOB", "SSN", "Card #"]);
  const [original] = useState({ mode: seed.complianceMode, retentionDays, disclosureEnabled, disclosureScript, chips: redactionChips });

  const requirements = REQUIREMENTS_BY_MODE[mode] ?? [];

  const changes =
    (mode !== original.mode ? 1 : 0) +
    (retentionDays !== original.retentionDays ? 1 : 0) +
    (disclosureEnabled !== original.disclosureEnabled ? 1 : 0) +
    (disclosureScript !== original.disclosureScript ? 1 : 0) +
    (redactionChips.length !== original.chips.length ? 1 : 0);

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={() => {
        setMode(original.mode);
        setRetentionDays(original.retentionDays);
        setDisclosureEnabled(original.disclosureEnabled);
        setDisclosureScript(original.disclosureScript);
        setRedactionChips(original.chips);
      }}
    >
      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <Eyebrow>Compliance mode</Eyebrow>
          <h2 className="mt-1 font-display text-[20px] font-semibold">Pick the regulation that governs this agent.</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Mode flips the available LLM providers, redaction defaults, retention windows, and disclosure script. Switching after
            the agent has logged calls preserves the original posture for those calls.
          </p>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as typeof mode)}
            className="mt-5 grid grid-cols-4 gap-3"
          >
            {(["none", "hipaa", "ferpa", "tcpa"] as const).map((m) => (
              <ToggleGroupItem
                key={m}
                value={m}
                className={cn(
                  "h-20 flex-col gap-2 rounded-md border bg-background text-[13px] font-medium transition",
                  mode === m ? "border-primary/60 bg-primary/5" : "hover:border-primary/40",
                )}
              >
                <ShieldCheck size={18} className={mode === m ? "text-primary" : "text-muted-foreground"} />
                <span className="uppercase tracking-[0.06em]">{m === "none" ? "None" : m}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Card>

        {requirements.length > 0 && (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <Eyebrow>Requirements</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">{mode.toUpperCase()} checklist</h2>
              </div>
              <ComplianceChip label={mode} state="active" />
            </div>
            <ul className="mt-4 grid gap-2">
              {requirements.map((req) => (
                <li key={req.id} className="flex items-start gap-3 rounded-md border bg-background p-3">
                  <CircleCheck size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{req.label}</div>
                    <div className="text-[12px] text-muted-foreground">{req.description}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-6">
          <Eyebrow>Retention window</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">{retentionDays} days</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            How long transcripts and recordings are retained before automatic deletion. HIPAA defaults to 0 days at provider
            (zero-retention) but workspace logs follow this window.
          </p>
          <Slider
            min={0}
            max={365}
            step={5}
            value={[retentionDays]}
            onValueChange={([v]) => v !== undefined && setRetentionDays(v)}
            className="mt-5"
          />
        </Card>

        <Card className="p-6">
          <Eyebrow>Redaction</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Auto-redact patterns at rest</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {redactionChips.map((chip) => (
              <Badge
                key={chip}
                variant="outline"
                className="gap-1.5 border-destructive/30 bg-destructive/5 text-destructive"
              >
                {chip}
                <button
                  onClick={() => setRedactionChips((cs) => cs.filter((c) => c !== chip))}
                  aria-label={`Remove ${chip}`}
                  className="text-destructive hover:text-destructive/70"
                >
                  <Trash2 size={11} />
                </button>
              </Badge>
            ))}
            <button
              onClick={() => setRedactionChips((cs) => [...cs, `Custom #${cs.length + 1}`])}
              className="rounded-md border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
            >
              + add pattern
            </button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>Disclosure script</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Spoken at the start of every call</h2>
            </div>
            <Switch checked={disclosureEnabled} onCheckedChange={setDisclosureEnabled} />
          </div>
          <Field className="mt-4">
            <FieldLabel htmlFor="disclosure">Script</FieldLabel>
            <Textarea
              id="disclosure"
              value={disclosureScript}
              onChange={(e) => setDisclosureScript(e.target.value)}
              disabled={!disclosureEnabled}
              className="min-h-[120px] font-mono text-[13px]"
            />
          </Field>
        </Card>
      </div>
    </AgentEditorShell>
  );
}
