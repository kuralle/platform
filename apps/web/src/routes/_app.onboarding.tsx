import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { WizardShell } from "@kuralle/ui/components/wizard-shell";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, GraduationCap, Wrench } from "lucide-react";
import { useState } from "react";

import { useWorkspace, VERTICAL_DESCRIPTION, VERTICAL_LABEL } from "@/contexts/workspace";
import type { Vertical } from "@/types/domain";

export const Route = createFileRoute("/_app/onboarding")({
  component: OnboardingRoute,
});

const VERTICAL_ICON: Record<Vertical, React.ComponentType<{ size?: number; className?: string }>> = {
  "home-services": Wrench,
  "appointment-services": Building2,
  education: GraduationCap,
};

function OnboardingRoute() {
  const navigate = useNavigate();
  const { workspace, setVertical } = useWorkspace();
  const [name, setName] = useState(workspace.name);
  const [phone, setPhone] = useState("");

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Eyebrow>Onboarding</Eyebrow>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">Set up your workspace.</h1>
        <p className="mt-1 max-w-md text-[14px] text-mute-slate">
          Five steps. Each takes under a minute. We'll have your first agent live in under eight.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="h-[480px]">
          <WizardShell
            title="New workspace"
            steps={[
              {
                id: "name",
                title: "Workspace",
                description: "Pick a name your team will recognize. We'll use it on receipts and audit logs.",
                render: () => (
                  <Field>
                    <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
                    <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                ),
              },
              {
                id: "vertical",
                title: "Vertical",
                description: "Pick what your operator does. We'll preset compliance defaults, voices, and templates.",
                render: () => (
                  <div className="grid gap-3">
                    {(Object.keys(VERTICAL_LABEL) as Vertical[]).map((v) => {
                      const Icon = VERTICAL_ICON[v];
                      const active = workspace.vertical === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVertical(v)}
                          className={cn(
                            "flex items-start gap-3 rounded-md border bg-background p-4 text-left transition",
                            active ? "border-signal-teal bg-signal-teal/5" : "hover:border-signal-teal/40",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-9 place-items-center rounded-md border",
                              active ? "border-signal-teal/60 bg-signal-teal/10 text-signal-teal" : "text-mute-slate",
                            )}
                          >
                            <Icon size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium">{VERTICAL_LABEL[v]}</div>
                            <div className="mt-1 text-[12px] text-mute-slate">{VERTICAL_DESCRIPTION[v]}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ),
              },
              {
                id: "phone",
                title: "Number",
                description: "Add a phone number now or skip and do it later. Twilio-native is fastest.",
                render: () => (
                  <Field>
                    <FieldLabel htmlFor="ph">Phone number</FieldLabel>
                    <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
                  </Field>
                ),
              },
              {
                id: "voice",
                title: "Voice",
                description: "Pick a default voice. You can change per-agent on the C4 Voice tab.",
                render: () => (
                  <Card className="p-4 text-[13px] text-mute-slate">
                    Defaults to the vertical-recommended voice (Aurora for HS, Lyra for Education, Marin for Medical).
                  </Card>
                ),
              },
              {
                id: "done",
                title: "Done",
                description: "We'll drop you on your empty home so you can build your first agent.",
                render: () => (
                  <Card className="p-6 text-center">
                    <p className="font-display text-[18px] font-semibold">All set.</p>
                    <p className="mt-1 text-[13px] text-mute-slate">
                      Your workspace inherits {VERTICAL_LABEL[workspace.vertical]} defaults. We'll be in your dashboard in
                      a moment.
                    </p>
                  </Card>
                ),
              },
            ]}
            onFinish={() => navigate({ to: "/home" })}
          />
        </div>
      </Card>
    </div>
  );
}
