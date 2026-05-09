import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { Link, createFileRoute } from "@tanstack/react-router";

import { useTelephony } from "@/hooks/api/telephony";
import { useActiveWorkspaceId } from "@/contexts/workspace";

export const Route = createFileRoute("/_app/telephony")({
  component: TelephonyRoute,
});

interface Connector {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  status: "connected" | "available" | "coming-soon";
  badge?: string;
}

const CONNECTORS: Connector[] = [
  {
    id: "twilio-native",
    name: "Twilio Native",
    description: "We provision numbers, manage routing, handle DTMF, and report on every call.",
    capabilities: ["Programmable Voice", "TwiML", "STIR/SHAKEN", "PSTN ↔ SIP"],
    status: "connected",
    badge: "Recommended",
  },
  {
    id: "twilio-byo",
    name: "Twilio BYO",
    description: "Bring your own Twilio account. We co-pilot only — your subaccount, your billing.",
    capabilities: ["Subaccount", "Existing numbers", "BYO billing"],
    status: "available",
  },
  {
    id: "sip",
    name: "SIP / BYOC",
    description: "Connect any SIP trunk (Bandwidth, Telnyx, on-prem PBX). Full control of routing.",
    capabilities: ["TLS", "TURN", "Codec negotiation", "BYO PBX"],
    status: "available",
  },
  {
    id: "agora",
    name: "Agora",
    description: "Real-time WebRTC for embedded widget calls.",
    capabilities: ["WebRTC", "Low latency"],
    status: "coming-soon",
  },
];

function TelephonyRoute() {
  const workspaceId = useActiveWorkspaceId();
  void useTelephony({ workspaceId });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Distribute"
        title="Telephony"
        description="Pick how Kuralle connects to the phone network. You can mix providers per workspace."
        actions={
          <Button nativeButton={false} render={<Link to="/phone-numbers" />} variant="outline">
            Manage phone numbers
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTORS.map((c) => (
          <Card key={c.id} className="flex h-full flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <Eyebrow>Connector</Eyebrow>
              {c.status === "connected" && <StatusPill tone="success">Connected</StatusPill>}
              {c.status === "available" && <StatusPill tone="neutral">Available</StatusPill>}
              {c.status === "coming-soon" && <StatusPill tone="info">Coming soon</StatusPill>}
            </div>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-md bg-foreground text-card font-mono text-[13px] font-semibold">
                {c.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0">
                <div className="font-display text-[15px] font-semibold">{c.name}</div>
                {c.badge && (
                  <Badge variant="outline" className="mt-0.5 border-primary/30 text-[10px] uppercase tracking-wide text-primary">
                    {c.badge}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-[13px] text-muted-foreground">{c.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {c.capabilities.map((cap) => (
                <Badge key={cap} variant="outline" className="text-[10px] uppercase tracking-wide">
                  {cap}
                </Badge>
              ))}
            </div>
            <div className="mt-auto pt-2">
              <Button
                disabled={c.status === "coming-soon"}
                variant={c.status === "connected" ? "outline" : "default"}
                className="w-full"
              >
                {c.status === "connected" ? "Manage" : c.status === "coming-soon" ? "Notify me" : "Connect"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
