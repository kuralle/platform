import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/** Returns paginated knowledge base document list for a workspace. */
export function useKb(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.kb.list.queryOptions({ input }),
  });
}
