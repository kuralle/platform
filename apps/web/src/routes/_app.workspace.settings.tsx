import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldDescription, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { Slider } from "@kuralle/ui/components/slider";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { Switch } from "@kuralle/ui/components/switch";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, KeyRound, Plug, Settings2, ShieldCheck, Webhook } from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/contexts/workspace";

export const Route = createFileRoute("/_app/workspace/settings")({
  component: WorkspaceSettingsRoute,
});

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "retention", label: "Retention defaults", icon: Bell },
  { id: "billing", label: "Billing", icon: KeyRound },
  { id: "mcp", label: "MCP", icon: Plug },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function WorkspaceSettingsRoute() {
  const { workspace, setEnvironment, setRegion } = useWorkspace();
  const [active, setActive] = useState<SectionId>("general");
  const [name, setName] = useState(workspace.name);
  const [retention, setRetention] = useState(90);
  const [apiKey] = useState("kur_live_8a3c…f912");
  const [requireSso, setRequireSso] = useState(true);
  const [require2fa, setRequire2fa] = useState(false);

  const dirty = name !== workspace.name || retention !== 90 || requireSso !== true || require2fa !== false;
  const changes = (name !== workspace.name ? 1 : 0) + (retention !== 90 ? 1 : 0) + (requireSso !== true ? 1 : 0) + (require2fa !== false ? 1 : 0);

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-cols-[240px_1fr]">
      <aside className="border-r bg-card">
        <div className="px-4 pt-5 pb-2">
          <Eyebrow>Workspace settings</Eyebrow>
          <div className="mt-1 font-display text-[16px] font-semibold">{workspace.name}</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition",
                active === s.id ? "bg-soft-hairline text-foreground" : "text-operator-slate hover:bg-soft-hairline",
              )}
            >
              <s.icon size={14} className={active === s.id ? "text-signal-teal" : ""} />
              {s.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex flex-col overflow-auto">
        <div className="flex-1 px-8 py-8">
          {active === "general" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>Identity</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">Workspace name</h2>
                <Field className="mt-4">
                  <FieldLabel htmlFor="ws">Name</FieldLabel>
                  <Input id="ws" value={name} onChange={(e) => setName(e.target.value)} />
                  <FieldDescription>Shown on receipts, audit logs, and the avatar dropdown.</FieldDescription>
                </Field>
              </Card>
              <Card className="p-6">
                <Eyebrow>Environment</Eyebrow>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Active environment</FieldLabel>
                    <Select value={workspace.environment} onValueChange={(v) => setEnvironment(v as typeof workspace.environment)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="sandbox">Sandbox</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Data region</FieldLabel>
                    <Select value={workspace.region} onValueChange={(v) => setRegion(v as typeof workspace.region)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="us-east-1">US East (Ashburn)</SelectItem>
                        <SelectItem value="us-west-2">US West (Oregon)</SelectItem>
                        <SelectItem value="eu-west-1">EU West (Dublin)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Card>
            </div>
          )}
          {active === "security" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>SSO</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">Require SSO for sign-in</h2>
                <p className="mt-1 text-[13px] text-mute-slate">
                  Drops magic-link sign-in. SOC 2 workspaces should keep this on.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[13px]">SSO required</span>
                  <Switch checked={requireSso} onCheckedChange={setRequireSso} />
                </div>
              </Card>
              <Card className="p-6">
                <Eyebrow>2FA</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">Two-factor for non-SSO operators</h2>
                <p className="mt-1 text-[13px] text-mute-slate">
                  TOTP via authenticator app. Enforced after the next sign-in.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[13px]">Require 2FA</span>
                  <Switch checked={require2fa} onCheckedChange={setRequire2fa} />
                </div>
              </Card>
              <Card className="p-6">
                <Eyebrow>API key</Eyebrow>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-[13px] tabular-nums">{apiKey}</span>
                  <Button variant="outline" className="ml-auto h-8 px-2 text-[12px]">Reveal</Button>
                  <Button variant="ghost" className="h-8 px-2 text-[12px]">Rotate</Button>
                </div>
              </Card>
            </div>
          )}
          {active === "webhooks" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>Outbound webhook</Eyebrow>
                <Field className="mt-3">
                  <FieldLabel>Endpoint URL</FieldLabel>
                  <Input defaultValue="https://api.calderonhvac.com/kuralle/events" />
                </Field>
                <Field className="mt-3">
                  <FieldLabel>Signing secret</FieldLabel>
                  <Input defaultValue="whsec_…" />
                </Field>
              </Card>
            </div>
          )}
          {active === "retention" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>Default retention window</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">{retention} days</h2>
                <p className="mt-1 text-[13px] text-mute-slate">
                  Workspace-level default. Each agent's compliance tab can override.
                </p>
                <Slider
                  min={0}
                  max={365}
                  step={5}
                  value={[retention]}
                  onValueChange={([v]) => v !== undefined && setRetention(v)}
                  className="mt-5"
                />
              </Card>
            </div>
          )}
          {active === "billing" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>Plan</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">Pro · $799 / mo</h2>
                <p className="mt-1 text-[13px] text-mute-slate">
                  Includes unlimited agents, HIPAA / FERPA add-ons, SSO, audit log retention 6 yrs.
                </p>
                <div className="mt-4 grid gap-2 text-[13px]">
                  <Row label="Calls (May)" value="3,184" />
                  <Row label="Cost YTD" value={<span className="font-mono tabular-nums text-receipt-gold">$3,996</span>} />
                  <Row label="Recovered YTD" value={<span className="font-mono tabular-nums text-receipt-gold">$182,400</span>} />
                </div>
              </Card>
            </div>
          )}
          {active === "mcp" && (
            <div className="mx-auto grid max-w-2xl gap-6">
              <Card className="p-6">
                <Eyebrow>Model Context Protocol</Eyebrow>
                <h2 className="mt-1 font-display text-[18px] font-semibold">Expose agents via MCP</h2>
                <p className="mt-1 text-[13px] text-mute-slate">
                  Lets internal LLM tooling call your agents as MCP tools. Off by default.
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-[13px]">MCP enabled</span>
                  <Switch />
                </div>
              </Card>
            </div>
          )}
        </div>
        <StickySaveBar
          changes={changes}
          onSave={() => undefined}
          onDiscard={() => {
            setName(workspace.name);
            setRetention(90);
            setRequireSso(true);
            setRequire2fa(false);
          }}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <span className="text-[12px] text-mute-slate">{label}</span>
      <span>{value}</span>
    </div>
  );
}
