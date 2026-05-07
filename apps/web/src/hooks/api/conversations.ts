import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/** Returns paginated conversation list for a workspace. */
export function useConversations(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.conversations.list.queryOptions({ input }),
  });
}
