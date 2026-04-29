import { Card } from "@kuralle/ui/components/card";
import { ComplianceChip } from "@kuralle/ui/components/compliance-chip";
import { DataTable } from "@kuralle/ui/components/data-table";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
import { PageHeader } from "@kuralle/ui/components/page-header";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Minus, X } from "lucide-react";
import { useMemo } from "react";

import { useWorkspace } from "@/contexts/workspace";
import { formatRelative, formatPct } from "@/lib/format";
import { spark, createRng } from "@/mocks";

export const Route = createFileRoute("/_app/workspace/compliance")({
  component: ComplianceRoute,
});

interface Reg {
  id: string;
  title: string;
  state: "active" | "action-required" | "violation" | "inactive";
  reqs: { label: string; met: boolean | "n/a" }[];
}

const REGULATIONS: Reg[] = [
  {
    id: "hipaa",
    title: "HIPAA",
    state: "inactive",
    reqs: [
      { label: "BAA executed", met: false },
      { label: "Zero retention mode", met: false },
      { label: "ePHI redaction", met: "n/a" },
      { label: "Audit log ≥ 6 yrs", met: "n/a" },
      { label: "Personnel training current", met: "n/a" },
    ],
  },
  {
    id: "ferpa",
    title: "FERPA",
    state: "inactive",
    reqs: [
      { label: "Consent flow", met: false },
      { label: "Identity verification gate", met: false },
      { label: "Disclosure script", met: false },
      { label: "Annual notification", met: "n/a" },
      { label: "Access logs", met: "n/a" },
    ],
  },
  {
    id: "tcpa",
    title: "TCPA",
    state: "active",
    reqs: [
      { label: "PEWC consent", met: true },
      { label: "DNC scrub", met: true },
      { label: "Window enforcement", met: true },
      { label: "STOP keyword", met: true },
      { label: "Caller-ID matching", met: true },
    ],
  },
  {
    id: "eu-ai-act",
    title: "EU AI Act",
    state: "action-required",
    reqs: [
      { label: "AI disclosure on first turn", met: true },
      { label: "Risk classification", met: false },
      { label: "Bias evaluation", met: false },
      { label: "Real-time logging", met: true },
      { label: "Incident playbook", met: false },
    ],
  },
];

const AUDIT_TRAIL = [
  { at: "2026-04-30T03:21:00Z", actor: "rj@calderon", event: "Compliance posture viewed" },
  { at: "2026-04-29T14:44:00Z", actor: "rj@calderon", event: "TCPA · PEWC scrub completed for batch_b00 (382 records)" },
  { at: "2026-04-28T09:12:00Z", actor: "system", event: "EU AI Act · risk classification missing alert raised" },
  { at: "2026-04-27T11:02:00Z", actor: "rj@calderon", event: "Disclosure script v3 saved" },
  { at: "2026-04-25T08:30:00Z", actor: "system", event: "Annual TCPA review · passed" },
];

type AuditRow = (typeof AUDIT_TRAIL)[number];

function ComplianceRoute() {
  const { workspace } = useWorkspace();
  const sparks = useMemo(() => {
    const rng = createRng(0xc4ff);
    return [spark(rng), spark(rng), spark(rng), spark(rng)];
  }, []);

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
    data: AUDIT_TRAIL,
    columns: auditColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Workspace"
        title="Compliance posture"
        description={`Live audit-grade view of ${workspace.name}'s posture across the four governing regulations.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Disclosures spoken" value="3,184" delta={0.18} spark={sparks[0]} />
        <KpiTile label="DNC hits" value="14" delta={-0.12} spark={sparks[1]} />
        <KpiTile label="ID-verified disclosures" value="612" delta={0.08} spark={sparks[2]} />
        <KpiTile label="Pending review items" value="3" delta={-0.5} spark={sparks[3]} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REGULATIONS.map((reg) => {
          const passed = reg.reqs.filter((r) => r.met === true).length;
          const total = reg.reqs.length;
          return (
            <Card key={reg.id} className="p-5">
              <div className="flex items-center justify-between">
                <div className="font-display text-[16px] font-semibold">{reg.title}</div>
                <ComplianceChip label={reg.title} state={reg.state} />
              </div>
              <div className="mt-2 font-mono text-[12px] tabular-nums text-muted-foreground">
                {passed}/{total} requirements · {formatPct(passed / total)}
              </div>
              <ul className="mt-3 grid gap-1.5 text-[12px]">
                {reg.reqs.map((r) => (
                  <li key={r.label} className="flex items-center gap-2">
                    {r.met === true && <CircleCheck size={12} className="shrink-0 text-emerald-500" />}
                    {r.met === false && <X size={12} className="shrink-0 text-destructive" />}
                    {r.met === "n/a" && <Minus size={12} className="shrink-0 text-muted-foreground" />}
                    <span className={r.met === "n/a" ? "text-muted-foreground" : "text-foreground"}>{r.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <Eyebrow>Audit trail</Eyebrow>
        <div className="mt-1 mb-3 font-display text-[16px] font-semibold">Last 7 days</div>
        <DataTable table={auditTable} hidePagination />
      </div>
    </div>
  );
}
