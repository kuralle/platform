import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useAgents(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.agents.list.queryOptions({ input }),
    enabled: !!input.workspaceId,
  });
}

/** Returns a single agent with its active version. */
export function useAgent(input: { workspaceId: string; agentId: string }) {
  return useQuery({
    ...$api.agents.get.queryOptions({ input }),
    enabled: !!input.workspaceId && !!input.agentId,
  });
}

/** Publishes an AgentIR — triggers projection, swaps activeVersionId. */
export function useAgentPublish() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.agents.publish.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.agents.get.queryKey({ input: { workspaceId: variables.workspaceId, agentId: variables.agentId } }),
      });
      void qc.invalidateQueries({
        queryKey: $api.agents.list.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}

/** Auto-saves an AgentIR snapshot without projection or pointer swap. */
export function useAgentAutoSave() {
  return useMutation({
    ...$api.agents.autoSave.mutationOptions(),
  });
}

/** Creates a new agent with an initial draft version. Invalidates agents.list on success. */
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.agents.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.agents.list.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}

/** Returns paginated version history for an agent. */
export function useAgentHistory(input: {
  workspaceId: string;
  agentId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.agents.history.queryOptions({ input }),
    enabled: !!input.workspaceId && !!input.agentId,
  });
}
