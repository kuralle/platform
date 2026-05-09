import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useDashboard(input: { workspaceId: string }) {
  return useQuery({
    ...$api.home.dashboard.queryOptions({ input }),
  });
}
