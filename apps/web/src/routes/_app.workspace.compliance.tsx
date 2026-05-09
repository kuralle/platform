import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { DataTable } from "@kuralle/ui/components/data-table";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { Skeleton } from "@kuralle/ui/components/skeleton";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useCompliancePosture } from "@/hooks/api/compliance";
import { useWorkspaceSettings } from "@/hooks/api/workspace";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_app/workspace/compliance")({
  component: ComplianceRoute,
});

interface Reg {
  id: string;
  title: string;
  state: string | null;
}

interface AuditRow {
  at: string;
  actor: string;
  event: string;
}

const PLACEHOLDER_AUDIT: AuditRow[] = [
  { at: new Date().toISOString(), actor: "system", event: "Compliance posture loaded from database" },
];

function ComplianceRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: wsSettings } = useWorkspaceSettings({ workspaceId });
  const { data: posture, isLoading, isError } = useCompliancePosture({ workspaceId });

  const regulations: Reg[] = useMemo(() => [
    { id: "hipaa", title: "HIPAA", state: posture?.hipaa ?? "inactive" },
    { id: "ferpa", title: "FERPA", state: posture?.ferpa ?? "inactive" },
    { id: "tcpa", title: "TCPA", state: posture?.tcpa ?? "active" },
    { id: "eu-ai-act", title: "EU AI Act", state: posture?.euAiAct ?? "action-required" },
  ], [posture]);

  const auditColumns = useMemo<ColumnDef<AuditRow>[]>(() => [
    {
      accessorKey: "at",
      header: "When",
      cell: ({ row }) => (
        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
          {formatRelative(row.original.at)}
        </span>
      ),
    },
    {
      accessorKey: "actor",
      header: "Actor",
      cell: ({ row }) => <span className="font-mono text-[12px] tabular-nums">{row.original.actor}</span>,
    },
    {
      accessorKey: "event",
      header: "Event",
      cell: ({ row }) => <span className="text-[13px]">{row.original.event}</span>,
    },
  ], []);

  const auditTable = useReactTable({
    data: PLACEHOLDER_AUDIT,
    columns: auditColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        <PageHeader eyebrow="Workspace" title="Compliance posture" description="Loading…" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[200px]" />)}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1280px] px-8 py-8">
        <PageHeader eyebrow="Workspace" title="Compliance posture" description="Error loading posture." />
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Failed to load compliance posture</AlertTitle>
          <AlertDescription>Try refreshing the page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Workspace"
        title="Compliance posture"
        description={`Live audit-grade view of ${wsSettings?.name ?? "Workspace"}'s posture across the four governing regulations.`}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {regulations.map((reg) => (
          <Card key={reg.id} className="p-5">
            <div className="flex items-center justify-between">
              <div className="font-display text-[16px] font-semibold">{reg.title}</div>
              <ComplianceChip label={reg.title} state={(reg.state as "active" | "action-required" | "violation" | "inactive") ?? "inactive"} />
            </div>
            <div className="mt-2 text-[12px] text-muted-foreground">
              {posture?.evaluatedAt ? (
                <span>Last evaluated {formatRelative(posture.evaluatedAt.toISOString())}</span>
              ) : (
                <span>Not yet evaluated</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Eyebrow>Audit trail</Eyebrow>
        <div className="mt-1 mb-3 font-display text-[16px] font-semibold">Recent</div>
        <DataTable table={auditTable} hidePagination />
      </div>
    </div>
  );
}
