import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Tabs, TabsList, TabsTrigger } from "@kuralle/ui/components/tabs";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";

import { useWorkspace } from "@/contexts/workspace";
import type { Vertical } from "@/types/domain";

export const Route = createFileRoute("/_app/templates")({
  component: TemplatesRoute,
});

const TEMPLATES_BY_VERTICAL: Record<Vertical, { id: string; name: string; sub: string; tags: string[] }[]> = {
  "home-services": [
    { id: "hvac-inbound", name: "HVAC inbound triage", sub: "Emergency vs routine + book ETA", tags: ["TCPA", "ServiceTitan"] },
    { id: "plumbing-night", name: "Plumbing 24/7 dispatcher", sub: "After-hours leak triage", tags: ["TCPA"] },
    { id: "electrical-quote", name: "Electrical quote follow-up", sub: "Re-engage abandoned quotes", tags: ["TCPA", "Outbound"] },
    { id: "field-generic", name: "Generic field service", sub: "Routing + booking", tags: ["TCPA"] },
  ],
  "appointment-services": [
    { id: "dental-reminder", name: "Dental reminder", sub: "T-24h reminder + reschedule", tags: ["HIPAA", "Acuity"] },
    { id: "medical-triage", name: "Medical triage", sub: "Symptom triage + appt routing", tags: ["HIPAA"] },
    { id: "vet-booking", name: "Vet booking", sub: "Emergency vs routine", tags: ["HIPAA"] },
    { id: "salon-rebook", name: "Salon rebook", sub: "Loyalty rebook", tags: ["TCPA", "Outbound"] },
  ],
  education: [
    { id: "admissions-tour", name: "Admissions tour reminder", sub: "Tour reminder + rescheduling", tags: ["FERPA"] },
    { id: "k12-status", name: "K-12 enrollment status", sub: "Identity-verified status update", tags: ["FERPA"] },
    { id: "bootcamp-nudge", name: "Bootcamp cohort nudge", sub: "Pre-cohort kickoff", tags: ["TCPA", "Outbound"] },
    { id: "uni-fafsa", name: "FAFSA reminder", sub: "Deadline + identity gate", tags: ["FERPA"] },
  ],
};

function TemplatesRoute() {
  const { workspace, setVertical } = useWorkspace();
  const [tab, setTab] = useState<Vertical>(workspace.vertical);
  const templates = TEMPLATES_BY_VERTICAL[tab];

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Configure"
        title="Start from a template"
        description="Each template ships with a starter prompt, voice, eval set, and connector skeleton for the picked vertical."
      />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Vertical);
          setVertical(v as Vertical);
        }}
      >
        <TabsList>
          <TabsTrigger value="home-services">Home Services</TabsTrigger>
          <TabsTrigger value="appointment-services">Appointment Services</TabsTrigger>
          <TabsTrigger value="education">Education</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col gap-3 p-5 transition hover:border-signal-teal/40">
            <Eyebrow>Template</Eyebrow>
            <div>
              <div className="font-display text-[16px] font-semibold">{t.name}</div>
              <p className="mt-1 text-[13px] text-mute-slate">{t.sub}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {t.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-wide">
                  {tag}
                </Badge>
              ))}
            </div>
            <Button
              nativeButton={false}
              render={<Link to="/agents/$agentId/behavior" params={{ agentId: "ag_a00" }} />}
              variant="outline"
              className="mt-auto gap-2"
            >
              <Sparkles size={14} /> Start from this template
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
