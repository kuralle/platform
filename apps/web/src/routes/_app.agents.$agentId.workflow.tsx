import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { EmptyState } from "@/components/empty-state";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useAgent } from "@/hooks/api/agents";

export const Route = createFileRoute("/_app/agents/$agentId/workflow")({
  component: WorkflowTab,
});

function shellStatus(s: string | undefined): "live" | "paused" | "draft" {
  if (s === "live" || s === "paused" || s === "draft") return s;
  return "draft";
}

function WorkflowTab() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();
  const workspaceId = useActiveWorkspaceId();
  const agentQuery = useAgent({ workspaceId, agentId });
  const agentData = agentQuery.data;

  const agentName = (() => {
    const snap = agentData?.activeVersion?.snapshot;
    if (snap && typeof snap === "object" && snap !== null && "name" in snap) {
      const n = (snap as { name?: string }).name?.trim();
      if (n) return n;
    }
    return agentData?.agent?.id ?? agentId;
  })();

  const rawStatus = agentData?.agent?.status === "archived" ? "draft" : agentData?.agent?.status;
  const agentStatus = shellStatus(rawStatus);

  return (
    <AgentEditorShell
      agentId={agentId}
      agentName={agentName}
      status={agentStatus}
      changes={0}
      onSave={() => undefined}
      onDiscard={() => undefined}
      hideStickyBar
    >
      <EmptyState
        icon={<GitBranch size={28} className="text-muted-foreground" />}
        title="Workflow editor — coming Sprint 4"
        description="We're rolling out the visual flow builder next sprint. Until then, behavior is configured via prompt and tools on the Agent overview."
        primaryAction={{
          label: "Back to behavior",
          onClick: () =>
            void navigate({ to: "/agents/$agentId/behavior", params: { agentId } }),
        }}
        secondaryAction={{
          label: "All agents",
          to: "/agents",
        }}
      />
    </AgentEditorShell>
  );
}
