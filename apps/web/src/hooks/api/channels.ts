import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/** Returns paginated channel endpoint list for a workspace. */
export function useChannels(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.channels.list.queryOptions({ input }),
  });
}
