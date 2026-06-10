import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { WizardShell } from "@kuralle/ui/components/wizard-shell";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, GraduationCap, Wrench } from "lucide-react";
import { useRef, useState } from "react";

import { useActiveWorkspaceId, VERTICAL_DESCRIPTION, VERTICAL_LABEL } from "@/contexts/workspace";
import { useOnboardingState, useCompleteOnboarding } from "@/hooks/api/onboarding";
import { useCreateAgent } from "@/hooks/api/agents";
import { useWorkspaceSettings } from "@/hooks/api/workspace";
import { $api } from "@/providers/api-provider";
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
  const queryClient = useQueryClient();
  const workspaceId = useActiveWorkspaceId();
  const { data: wsSettings } = useWorkspaceSettings({ workspaceId });
  const { data: _onboardingState } = useOnboardingState({ workspaceId });
  const completeOnboarding = useCompleteOnboarding();
  const createAgent = useCreateAgent();
  const finishOnceRef = useRef(false);

  const [name, setName] = useState(wsSettings?.name ?? "");
  const [phone, setPhone] = useState("");
  const [vertical, setVertical] = useState<Vertical>((wsSettings?.vertical as Vertical) ?? "home-services");

  const handleFinish = () => {
    if (finishOnceRef.current || completeOnboarding.isPending || createAgent.isPending) return;
    finishOnceRef.current = true;
    completeOnboarding.mutate(
      {
        workspaceId,
        name: name || wsSettings?.name || "",
        vertical,
        phone: phone || undefined,
      },
      {
        onSuccess: async () => {
          try {
            const list = await queryClient.fetchQuery({
              ...$api.agents.list.queryOptions({ input: { workspaceId } }),
            });
            const existing = list.items[0];
            if (existing) {
              void navigate({
                to: "/agents/$agentId/behavior",
                params: { agentId: existing.id },
              });
              return;
            }
            createAgent.mutate(
              { workspaceId },
              {
                onSuccess: (data) => {
                  void navigate({
                    to: "/agents/$agentId/behavior",
                    params: { agentId: data.agentId },
                  });
                },
                onError: () => {
                  finishOnceRef.current = false;
                },
              },
            );
          } catch {
            finishOnceRef.current = false;
          }
        },
        onError: () => {
          finishOnceRef.current = false;
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Eyebrow>Onboarding</Eyebrow>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">Set up your workspace.</h1>
        <p className="mt-1 max-w-md text-[14px] text-muted-foreground">
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
                      const active = vertical === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVertical(v)}
                          className={cn(
                            "flex items-start gap-3 rounded-md border bg-background p-4 text-left transition",
                            active ? "border-primary bg-primary/5" : "hover:border-primary/40",
                          )}
                        >
                          <span
                            className={cn(
                              "grid size-9 place-items-center rounded-md border",
                              active ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground",
                            )}
                          >
                            <Icon size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-medium">{VERTICAL_LABEL[v]}</div>
                            <div className="mt-1 text-[12px] text-muted-foreground">{VERTICAL_DESCRIPTION[v]}</div>
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
                description: "Connect a WhatsApp Business number now or skip and do it later.",
                render: () => (
                  <Field>
                    <FieldLabel htmlFor="ph">Phone number</FieldLabel>
                    <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
                  </Field>
                ),
              },
              {
                id: "voice",
                title: "Voice & Number",
                description: "Confirm the number to connect, or skip and configure later from Settings.",
                render: ({ goNext }) => (
                  <div className="flex flex-col gap-4">
                    <Field>
                      <FieldLabel htmlFor="ph-voice">Phone number</FieldLabel>
                      <Input id="ph-voice" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
                    </Field>
                    <button
                      type="button"
                      className="self-start text-[13px] text-muted-foreground underline hover:text-foreground"
                      onClick={() => { setPhone(""); goNext(); }}
                    >
                      Skip — I&apos;ll connect later
                    </button>
                  </div>
                ),
              },
              {
                id: "done",
                title: "Done",
                description: "Connect your number from the Numbers page when you are ready.",
                render: () => (
                  <Card className="p-6 text-center">
                    <p className="font-display text-[18px] font-semibold">Your workspace is ready.</p>
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      Your workspace inherits {VERTICAL_LABEL[vertical]} defaults. Your WhatsApp number connection happens
                      next, from the Numbers page. We&apos;ll set up routing, verify your business with the carrier, and
                      run a test call together.
                    </p>
                    <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                      <Button nativeButton={false} render={<Link to="/phone-numbers" />}>
                        Go to Numbers
                      </Button>
                      <Link to="/home" className="text-[13px] text-muted-foreground underline hover:text-foreground">
                        Skip to dashboard
                      </Link>
                    </div>
                  </Card>
                ),
              },
            ]}
            finishLabel={completeOnboarding.isPending ? "Saving…" : "Complete setup"}
            onFinish={handleFinish}
          />
        </div>
      </Card>
      {completeOnboarding.isError && (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Failed to complete onboarding</AlertTitle>
          <AlertDescription>{(completeOnboarding.error as Error)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
