import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import { Switch } from "@kuralle/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kuralle/ui/components/table";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ImportNumberWizard } from "@/components/modals/import-number-wizard";
import { makeAgents, makePhoneNumbers } from "@/mocks";

export const Route = createFileRoute("/_app/phone-numbers")({
  component: PhoneNumbersRoute,
});

function PhoneNumbersRoute() {
  const [importOpen, setImportOpen] = useState(false);
  const numbers = useMemo(() => makePhoneNumbers(8), []);
  const agentsById = useMemo(() => {
    const map = new Map<string, string>();
    makeAgents(10).forEach((a) => map.set(a.id, a.name));
    return map;
  }, []);
  const [recording, setRecording] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(numbers.map((n) => [n.id, n.recording])),
  );

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Distribute"
        title="Phone numbers"
        description="Numbers attached to this workspace. Each number routes to one agent at a time."
        actions={
          <Button onClick={() => setImportOpen(true)}>
            <Plus size={16} /> Import number
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Attached agent</TableHead>
              <TableHead className="text-right">Recording</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numbers.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono tabular-nums">{n.number}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {n.provider.replace("twilio-", "Twilio ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-[12px] text-mute-slate">{n.region}</TableCell>
                <TableCell className="text-[13px]">
                  {n.attachedAgentId ? (
                    agentsById.get(n.attachedAgentId)
                  ) : (
                    <span className="text-mute-slate italic">Not attached</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    checked={recording[n.id] ?? false}
                    onCheckedChange={(c) => setRecording((r) => ({ ...r, [n.id]: c }))}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <StatusPill tone={n.attachedAgentId ? "success" : "neutral"}>
                    {n.attachedAgentId ? "Live" : "Detached"}
                  </StatusPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <ImportNumberWizard open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
