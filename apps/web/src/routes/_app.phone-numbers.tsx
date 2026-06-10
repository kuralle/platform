import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@kuralle/ui/components/collapsible";
import { DataTable } from "@kuralle/ui/components/data-table";
import { DataTableColumnHeader } from "@kuralle/ui/components/data-table-column-header";
import { DataTableToolbar } from "@kuralle/ui/components/data-table-toolbar";
import { PageHeader } from "@kuralle/ui/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kuralle/ui/components/select";
import { StatusPill } from "@kuralle/ui/components/status-pill";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Copy, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { ConnectWhatsAppWizard } from "@/components/modals/connect-whatsapp-wizard";
import { EmptyState } from "@/components/empty-state";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useAgents } from "@/hooks/api/agents";
import {
  useBindAgent,
  useChannelStatus,
  useWebhookInfo,
} from "@/hooks/api/channels";
import { usePhoneNumbers } from "@/hooks/api/phone-numbers";

interface PhoneNumberRow {
  id: string;
  channelKind: string;
  identifier: string;
  displayName: string | null;
  attachedAgentId: string | null;
  metadata: unknown;
}

export const Route = createFileRoute("/_app/phone-numbers")({
  component: PhoneNumbersRoute,
});

function DeployStatusCell({
  workspaceId,
  endpointId,
}: {
  workspaceId: string;
  endpointId: string;
}) {
  const statusQuery = useChannelStatus({ workspaceId, endpointId });

  if (statusQuery.isLoading) {
    return (
      <StatusPill tone="neutral">Checking…</StatusPill>
    );
  }

  if (statusQuery.data?.receivingTraffic) {
    return <StatusPill tone="success">Receiving traffic</StatusPill>;
  }

  return <StatusPill tone="warning">Awaiting webhook</StatusPill>;
}

function AgentBindingCell({
  workspaceId,
  endpointId,
  attachedAgentId,
  agents,
}: {
  workspaceId: string;
  endpointId: string;
  attachedAgentId: string | null;
  agents: Array<{ id: string }>;
}) {
  const bindAgent = useBindAgent();
  const statusQuery = useChannelStatus({ workspaceId, endpointId });
  const boundName = statusQuery.data?.boundAgent?.name;

  return (
    <Select
      value={attachedAgentId ?? ""}
      onValueChange={(value) => {
        if (!value) return;
        void bindAgent.mutateAsync({
          workspaceId,
          endpointId,
          agentId: value,
        });
      }}
    >
      <SelectTrigger className="h-8 w-[200px]">
        <SelectValue placeholder="Select agent">
          {boundName ?? attachedAgentId ?? "Select agent"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function WebhookSetupPanel({ workspaceId }: { workspaceId: string }) {
  const webhookQuery = useWebhookInfo({ workspaceId });

  if (webhookQuery.isLoading || !webhookQuery.data) {
    return (
      <p className="text-[12px] text-muted-foreground">Loading webhook setup…</p>
    );
  }

  const { url, verifyTokenHint, instructions } = webhookQuery.data;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-[12px] leading-relaxed">
      <p className="mb-3 text-muted-foreground">{instructions}</p>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 font-mono text-[11px]">
          <span className="truncate">{url}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => void navigator.clipboard.writeText(url)}
          >
            <Copy size={14} />
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 font-mono text-[11px]">
          <span>Verify token: {verifyTokenHint}</span>
        </div>
      </div>
    </div>
  );
}

export function PhoneNumbersRoute() {
  const [connectOpen, setConnectOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const workspaceId = useActiveWorkspaceId();
  const pnQuery = usePhoneNumbers({ workspaceId });
  const agentsQuery = useAgents({ workspaceId, limit: 100 });
  const numbers = useMemo(
    () => (pnQuery.data?.items ?? []) as PhoneNumberRow[],
    [pnQuery.data?.items],
  );
  const agents = useMemo(
    () => agentsQuery.data?.items ?? [],
    [agentsQuery.data?.items],
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo<ColumnDef<PhoneNumberRow>[]>(
    () => [
      {
        accessorKey: "identifier",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Number" />
        ),
        meta: {
          label: "Number",
          variant: "text",
          placeholder: "Search by number",
        },
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">
            {row.original.displayName ?? row.original.identifier}
          </span>
        ),
        filterFn: (row, _id, value) => {
          const q = String(value ?? "").toLowerCase();
          if (!q) return true;
          return row.original.identifier.toLowerCase().includes(q);
        },
      },
      {
        accessorKey: "channelKind",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Type" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {row.original.channelKind}
          </Badge>
        ),
      },
      {
        id: "agent",
        header: "Bound agent",
        cell: ({ row }) => (
          <AgentBindingCell
            workspaceId={workspaceId}
            endpointId={row.original.id}
            attachedAgentId={row.original.attachedAgentId}
            agents={agents}
          />
        ),
      },
      {
        id: "status",
        header: () => <div className="text-right">Deploy status</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <DeployStatusCell
              workspaceId={workspaceId}
              endpointId={row.original.id}
            />
          </div>
        ),
      },
    ],
    [agents, workspaceId],
  );

  const table = useReactTable({
    data: numbers,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-8">
      <PageHeader
        eyebrow="Distribute"
        title="WhatsApp numbers"
        description="Connect a WhatsApp Business number, bind a published agent, and complete Meta webhook setup. Messages outside the 24-hour window are deferred until the customer messages again."
        actions={
          <Button onClick={() => setConnectOpen(true)}>
            <Plus size={16} /> Connect WhatsApp
          </Button>
        }
      />

      <Collapsible
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
        className="mb-6"
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg border px-4 py-3 text-left text-[13px] font-medium">
          <ChevronDown
            size={16}
            className={`transition-transform ${webhookOpen ? "rotate-180" : ""}`}
          />
          Webhook setup
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <WebhookSetupPanel workspaceId={workspaceId} />
        </CollapsibleContent>
      </Collapsible>

      {!pnQuery.isLoading && numbers.length === 0 ? (
        <EmptyState
          title="No WhatsApp numbers connected"
          description="Connect your Meta WhatsApp Business account to deploy a published agent on Cloudflare."
          primaryAction={{
            label: "+ Connect WhatsApp",
            onClick: () => setConnectOpen(true),
          }}
        />
      ) : (
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
      )}

      <ConnectWhatsAppWizard
        open={connectOpen}
        onOpenChange={setConnectOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}
