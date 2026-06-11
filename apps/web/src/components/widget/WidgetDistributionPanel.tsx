import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kuralle/ui/components/select";
import { Copy } from "lucide-react";

import { useBindAgent, useChannelStatus } from "@/hooks/api/channels";
import { useAgents } from "@/hooks/api/agents";
import { useEnableWidget } from "@/hooks/api/widget";
import { useWidgetEndpoints } from "@/hooks/api/widget-endpoints";

import { buildEmbedSnippet } from "./embed-snippet";
import type { WidgetStringsConfig, WidgetThemeConfig } from "./types";

function WidgetAgentSelect({
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
      <SelectTrigger className="h-9 w-full">
        <SelectValue placeholder="Select agent">
          {boundName ?? attachedAgentId ?? "Select agent"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {boundName && agent.id === attachedAgentId ? boundName : agent.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function WidgetDistributionPanel({
  workspaceId,
  embedKey,
  serverUrl,
  theme,
  strings,
}: {
  workspaceId: string;
  embedKey: string | null;
  serverUrl: string;
  theme: WidgetThemeConfig;
  strings: WidgetStringsConfig;
}) {
  const enableWidget = useEnableWidget();
  const endpointsQuery = useWidgetEndpoints({ workspaceId });
  const agentsQuery = useAgents({ workspaceId });
  const endpoint = endpointsQuery.data?.items[0] ?? null;
  const agents = agentsQuery.data?.items ?? [];

  if (!embedKey) {
    return (
      <Card className="mb-4 p-4">
        <div className="text-[13px] font-medium">Web widget</div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Enable the embeddable chat widget for this workspace. Requires admin access.
        </p>
        <Button
          className="mt-3"
          onClick={() => enableWidget.mutate({ workspaceId })}
          disabled={enableWidget.isPending}
        >
          {enableWidget.isPending ? "Enabling…" : "Enable web widget"}
        </Button>
        {enableWidget.isError && (
          <p className="mt-2 text-[12px] text-destructive">
            {(enableWidget.error as Error)?.message ?? "Failed to enable widget"}
          </p>
        )}
      </Card>
    );
  }

  const snippet = buildEmbedSnippet({
    serverUrl,
    embedKey,
    theme,
    strings,
  });

  return (
    <Card className="mb-4 grid gap-4 p-4">
      <div>
        <div className="text-[13px] font-medium">Embed key</div>
        <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <code className="flex-1 truncate font-mono text-[12px]">{embedKey}</code>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => void navigator.clipboard.writeText(embedKey)}
            aria-label="Copy embed key"
          >
            <Copy size={14} />
          </Button>
        </div>
      </div>

      {endpoint && (
        <Field>
          <FieldLabel>Bound agent</FieldLabel>
          <WidgetAgentSelect
            workspaceId={workspaceId}
            endpointId={endpoint.id}
            attachedAgentId={endpoint.attachedAgentId}
            agents={agents}
          />
        </Field>
      )}

      <div>
        <div className="text-[13px] font-medium">Embed snippet</div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Paste before the closing <code className="text-[11px]">&lt;/body&gt;</code> tag on your site.
        </p>
        <div className="relative mt-2 rounded-md border bg-muted/30 p-3">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {snippet}
          </pre>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={() => void navigator.clipboard.writeText(snippet)}
            aria-label="Copy embed snippet"
          >
            <Copy size={14} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
