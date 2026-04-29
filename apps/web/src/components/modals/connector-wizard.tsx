import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Switch } from "@kuralle/ui/components/switch";
import { WizardShell } from "@kuralle/ui/components/wizard-shell";
import { Check, ExternalLink } from "lucide-react";
import { useState } from "react";

interface ConnectorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vertical: "home-services" | "appointment-services" | "education";
}

const CONNECTOR_BY_VERTICAL = {
  "home-services": { name: "ServiceTitan", logo: "🔧", testCallTopic: "create_job" },
  "appointment-services": { name: "Acuity", logo: "📅", testCallTopic: "book_appointment" },
  education: { name: "Slate", logo: "🎓", testCallTopic: "schedule_tour" },
} as const;

export function ConnectorWizard({ open, onOpenChange, vertical }: ConnectorWizardProps) {
  const conn = CONNECTOR_BY_VERTICAL[vertical];
  const [token, setToken] = useState("");
  const [tools, setTools] = useState<Record<string, boolean>>({
    create_job: true,
    update_job: false,
    cancel_job: false,
    list_techs: true,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5">
          <DialogTitle className="flex items-center gap-3 font-display text-[20px]">
            <span className="grid size-9 place-items-center rounded-md bg-soft-hairline text-[18px]">
              {conn.logo}
            </span>
            Connect {conn.name}
          </DialogTitle>
          <DialogDescription>
            Authorize, map fields, enable tools, and run a test call. Should take under 90 seconds.
          </DialogDescription>
        </DialogHeader>
        <div className="h-[480px]">
          <WizardShell
            steps={[
              {
                id: "auth",
                title: "Authorize",
                description: `Sign into your ${conn.name} workspace and approve Kuralle access.`,
                render: ({ goNext }) => (
                  <div className="grid gap-3">
                    <Card className="p-4">
                      <Eyebrow>OAuth</Eyebrow>
                      <p className="mt-2 text-[13px]">Click to open the {conn.name} consent screen in a new tab.</p>
                      <Button className="mt-3 gap-2" onClick={goNext}>
                        Authorize {conn.name} <ExternalLink size={14} />
                      </Button>
                    </Card>
                    <Field>
                      <FieldLabel htmlFor="t">Or paste an API token</FieldLabel>
                      <Input id="t" value={token} onChange={(e) => setToken(e.target.value)} placeholder="st_live_…" />
                    </Field>
                  </div>
                ),
              },
              {
                id: "map",
                title: "Map fields",
                description: "Match your workspace fields to Kuralle's canonical schema.",
                render: () => (
                  <div className="grid gap-2">
                    {[
                      { ours: "caller_phone", theirs: "customer.phone_primary" },
                      { ours: "service_window", theirs: "schedule.window" },
                      { ours: "ticket_priority", theirs: "job.priority" },
                      { ours: "tech_id", theirs: "technician.id" },
                    ].map((row) => (
                      <div key={row.ours} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border bg-background p-3 text-[13px]">
                        <span className="font-mono text-[12px] tabular-nums">{row.ours}</span>
                        <span className="text-mute-slate">→</span>
                        <span className="font-mono text-[12px] tabular-nums text-mute-slate">{row.theirs}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                id: "tools",
                title: "Enable tools",
                description: "Pick what the agent is allowed to do in your system of record.",
                render: () => (
                  <div className="grid gap-2">
                    {Object.keys(tools).map((toolName) => (
                      <div key={toolName} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                        <div>
                          <div className="font-mono text-[13px] tabular-nums">{toolName}</div>
                          <div className="text-[12px] text-mute-slate">
                            {toolName === "create_job"
                              ? "Create a new job in the operator's queue."
                              : toolName === "update_job"
                                ? "Update job details (window, priority, notes)."
                                : toolName === "cancel_job"
                                  ? "Cancel a pending job — destructive."
                                  : "List available technicians and their capacities."}
                          </div>
                        </div>
                        <Switch
                          checked={tools[toolName]}
                          onCheckedChange={(c) => setTools((t) => ({ ...t, [toolName]: c }))}
                        />
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                id: "test",
                title: "Test call",
                description: `Run a synthetic call that exercises ${conn.testCallTopic}.`,
                render: () => (
                  <Card className="p-6 text-center">
                    <Check size={32} className="mx-auto text-booked-green" />
                    <p className="mt-3 text-[14px] font-medium">All systems go.</p>
                    <p className="mt-1 text-[12px] text-mute-slate">
                      Test call resolved in 2.4s with 4 tool round-trips. Connector status: Live.
                    </p>
                  </Card>
                ),
              },
            ]}
            onFinish={() => onOpenChange(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
