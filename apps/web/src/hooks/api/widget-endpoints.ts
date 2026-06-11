import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useWidgetEndpoints(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "widget" },
    }),
    enabled: !!input.workspaceId,
  });
}
