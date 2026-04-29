import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { Slider } from "@kuralle/ui/components/slider";
import { WizardShell } from "@kuralle/ui/components/wizard-shell";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ShieldCheck, Upload } from "lucide-react";
import { useMemo, useState } from "react";

import { formatUsd } from "@/lib/format";
import { makeAgents, makePhoneNumbers } from "@/mocks";

export const Route = createFileRoute("/_app/batches/new")({
  component: NewBatchRoute,
});

function NewBatchRoute() {
  const navigate = useNavigate();
  const agents = useMemo(() => makeAgents(10), []);
  const numbers = useMemo(() => makePhoneNumbers(8), []);
  const [agentId, setAgentId] = useState(agents[0]!.id);
  const [numberId, setNumberId] = useState(numbers.find((n) => n.attachedAgentId)?.id ?? numbers[0]!.id);
  const [recipients] = useState(384);
  const [concurrency, setConcurrency] = useState(8);
  const [scheduleNow, setScheduleNow] = useState(true);

  const estCost = (recipients * 0.32).toFixed(2);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Eyebrow>Operate</Eyebrow>
      <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">New outbound batch</h1>
      <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
        Five steps. We'll TCPA-vet the recipient list and confirm window before any call goes out.
      </p>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="h-[520px]">
          <WizardShell
            steps={[
              {
                id: "agent",
                title: "Agent · number",
                description: "Pick the agent and the number it'll dial out from.",
                render: () => (
                  <div className="grid gap-4">
                    <Field>
                      <FieldLabel>Agent</FieldLabel>
                      <Select value={agentId} onValueChange={setAgentId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Outbound number</FieldLabel>
                      <Select value={numberId} onValueChange={setNumberId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {numbers.map((n) => (
                            <SelectItem key={n.id} value={n.id}>
                              {n.number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ),
              },
              {
                id: "recipients",
                title: "Recipients",
                description: "Upload a CSV with phone numbers. We'll DNC-scrub before sending.",
                render: () => (
                  <Card className="border-dashed bg-muted/50 p-8 text-center">
                    <Upload size={28} className="mx-auto text-muted-foreground" />
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      Drop a CSV or <span className="cursor-pointer underline-offset-2 hover:underline">browse</span>.
                    </p>
                    <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {recipients} recipients loaded · 12 invalid · 4 DNC scrubbed
                    </p>
                  </Card>
                ),
              },
              {
                id: "schedule",
                title: "Schedule",
                description: "Send now or schedule. We enforce 8am–9pm in each recipient's timezone.",
                render: () => (
                  <div className="grid gap-3">
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3">
                      <input
                        type="radio"
                        checked={scheduleNow}
                        onChange={() => setScheduleNow(true)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-[13px]">Send as soon as TCPA-vet completes</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3">
                      <input
                        type="radio"
                        checked={!scheduleNow}
                        onChange={() => setScheduleNow(false)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-[13px]">Schedule for…</span>
                      <Input className="ml-auto h-8 w-[180px]" defaultValue="2026-05-01 10:00" />
                    </label>
                    <Alert>
                      <ShieldCheck />
                      <AlertTitle>TCPA window check</AlertTitle>
                      <AlertDescription>
                        14 recipients fall outside their local 8am–9pm window. We'll auto-defer those.
                      </AlertDescription>
                    </Alert>
                  </div>
                ),
              },
              {
                id: "concurrency",
                title: "Concurrency",
                description: "How many calls Kuralle places in parallel. Higher is faster but costs more.",
                render: () => (
                  <div className="grid gap-4">
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-[28px] tabular-nums">{concurrency}</span>
                      <Slider
                        min={1}
                        max={32}
                        step={1}
                        value={[concurrency]}
                        onValueChange={([v]) => v !== undefined && setConcurrency(v)}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      ETA at this concurrency: ~{Math.ceil(recipients / concurrency / 4)} minutes.
                    </p>
                  </div>
                ),
              },
              {
                id: "review",
                title: "Review",
                description: "Last chance to back out. Cost is auth'd, not charged, until completion.",
                render: () => (
                  <div className="grid gap-3">
                    <Card className="p-4">
                      <Eyebrow>Estimate</Eyebrow>
                      <div className="mt-2 grid gap-1 text-[13px]">
                        <Row label="Agent" value={agents.find((a) => a.id === agentId)?.name ?? "—"} />
                        <Row label="Number" value={numbers.find((n) => n.id === numberId)?.number ?? "—"} />
                        <Row label="Recipients" value={`${recipients}`} />
                        <Row label="Concurrency" value={`${concurrency}`} />
                        <Row label="Schedule" value={scheduleNow ? "ASAP" : "2026-05-01 10:00"} />
                        <hr className="my-2 border-border" />
                        <Row
                          label="Cost estimate"
                          value={
                            <span className="font-mono tabular-nums text-foreground">
                              {formatUsd(parseFloat(estCost), { precise: true })}
                            </span>
                          }
                        />
                      </div>
                    </Card>
                    <Alert>
                      <CheckCircle2 />
                      <AlertTitle>Ready to launch</AlertTitle>
                      <AlertDescription>
                        We'll TCPA-vet, DNC-scrub, then dial. You can pause from the Batches list at any time.
                      </AlertDescription>
                    </Alert>
                  </div>
                ),
              },
            ]}
            finishLabel="Launch batch"
            onFinish={() => navigate({ to: "/batches" })}
          />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  );
}
