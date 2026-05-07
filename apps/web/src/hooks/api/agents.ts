import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useAgents(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.agents.list.queryOptions({ input }),
  });
}
