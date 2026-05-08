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

import { useActiveWorkspaceId, useWorkspace } from "@/contexts/workspace";
import { useAgents } from "@/hooks/api/agents";
import { useTelephony } from "@/hooks/api/telephony";
import { useCreateBatch } from "@/hooks/api/batches";
import { formatUsd } from "@/lib/format";
import type { Vertical } from "@/types/domain";

export const Route = createFileRoute("/_app/batches/new")({
  component: NewBatchRoute,
});

function NewBatchRoute() {
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const { workspace } = useWorkspace();
  const { data: agentsList } = useAgents({ workspaceId });
  const { data: endpointsList } = useTelephony({ workspaceId });
  const createBatch = useCreateBatch();

  const agents = useMemo(() => (agentsList?.items ?? []) as unknown as { id: string; name: string }[], [agentsList?.items]);
  const numbers = useMemo(() => (endpointsList?.items ?? []) as unknown as { id: string; number?: string; phoneNumber?: string }[], [endpointsList?.items]);

  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [numberId, setNumberId] = useState(numbers[0]?.id ?? "");
  const [recipients, setRecipients] = useState(100);
  const [concurrency, setConcurrency] = useState(8);
  const [scheduleNow, setScheduleNow] = useState(true);

  const estCost = (recipients * 0.32).toFixed(2);

  const handleFinish = () => {
    createBatch.mutate(
      {
        workspaceId,
        name: name || "Untitled batch",
        agentId: agentId || null,
        channelKind: "voice",
        channelEndpointId: numberId || null,
        vertical: (workspace.vertical ?? "home-services") as Vertical,
        scheduledFor: scheduleNow ? null : new Date(),
        totalRecipients: recipients,
        concurrency,
      },
      {
        onSuccess: () => navigate({ to: "/batches" }),
      },
    );
  };

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
                      <Select value={agentId} onValueChange={(v) => v != null && setAgentId(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Outbound number</FieldLabel>
                      <Select value={numberId} onValueChange={(v) => v != null && setNumberId(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {numbers.map((n) => (
                            <SelectItem key={n.id} value={n.id}>{n.phoneNumber ?? n.number ?? n.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                ),
              },
              {
                id: "name",
                title: "Name",
                description: "Give this batch a name so you can find it later.",
                render: () => (
                  <Field>
                    <FieldLabel>Batch name</FieldLabel>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Win-back Q4" />
                  </Field>
                ),
              },
              {
                id: "recipients",
                title: "Recipients",
                description: "Upload a CSV with phone numbers. We'll DNC-scrub before sending.",
                render: () => (
                  <div className="grid gap-4">
                    <Card className="border-dashed bg-muted/50 p-8 text-center">
                      <Upload size={28} className="mx-auto text-muted-foreground" />
                      <p className="mt-3 text-[13px] text-muted-foreground">
                        Drop a CSV or <span className="cursor-pointer underline-offset-2 hover:underline">browse</span>.
                      </p>
                    </Card>
                    <Field>
                      <FieldLabel>Total recipients</FieldLabel>
                      <Input
                        type="number"
                        value={recipients}
                        onChange={(e) => setRecipients(Math.max(0, parseInt(e.target.value) || 0))}
                      />
                    </Field>
                  </div>
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
                        We'll auto-defer recipients outside their local 8am–9pm window.
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
                        onValueChange={(vals) => {
                          const v = typeof vals === "number" ? vals : vals[0];
                          if (v !== undefined) setConcurrency(v);
                        }}
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
                        <Row label="Name" value={name || "Untitled batch"} />
                        <Row label="Agent" value={agents.find((a) => a.id === agentId)?.name ?? "—"} />
                        <Row label="Number" value={numbers.find((n) => n.id === numberId)?.phoneNumber ?? numbers.find((n) => n.id === numberId)?.number ?? "—"} />
                        <Row label="Recipients" value={`${recipients}`} />
                        <Row label="Concurrency" value={`${concurrency}`} />
                        <Row label="Schedule" value={scheduleNow ? "ASAP" : "Scheduled"} />
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
            finishLabel={createBatch.isPending ? "Launching…" : "Launch batch"}
            onFinish={handleFinish}
          />
        </div>
      </Card>
      {createBatch.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Failed to create batch</AlertTitle>
          <AlertDescription>{(createBatch.error as Error)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      )}
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
