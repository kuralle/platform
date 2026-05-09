import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Link, createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/empty-state";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useTelephony } from "@/hooks/api/telephony";

export const Route = createFileRoute("/_app/telephony")({
  component: TelephonyRoute,
});

function TelephonyRoute() {
  const workspaceId = useActiveWorkspaceId();
  const telephonyQuery = useTelephony({ workspaceId });
  const endpoints = telephonyQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Distribute"
        title="Telephony"
        description="Voice endpoints provisioned for this workspace. Manage numbers and attachments from Phone numbers."
        actions={
          <Button nativeButton={false} render={<Link to="/phone-numbers" />} variant="outline">
            Manage phone numbers
          </Button>
        }
      />
      {telephonyQuery.isPending ? (
        <p className="text-[13px] text-muted-foreground">Loading voice endpoints…</p>
      ) : endpoints.length === 0 ? (
        <EmptyState
          title="No voice endpoints yet"
          description="Connect a carrier and attach a number to an agent to start placing and receiving PSTN calls."
          primaryAction={{ label: "Open phone numbers", to: "/phone-numbers" }}
        />
      ) : (
        <div className="grid gap-3">
          {endpoints.map((e) => (
            <Card key={e.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Eyebrow>Voice endpoint</Eyebrow>
                <div className="mt-1 font-mono text-[14px] font-semibold tabular-nums">{e.identifier}</div>
                {e.displayName ? (
                  <div className="text-[13px] text-muted-foreground">{e.displayName}</div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {e.channelKind}
                  </Badge>
                  {e.attachedAgentId ? (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                      Agent {e.attachedAgentId}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      Unassigned
                    </Badge>
                  )}
                </div>
              </div>
              <Button nativeButton={false} render={<Link to="/phone-numbers" />} variant="outline" className="shrink-0">
                Manage
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
