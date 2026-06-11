import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useWidgetConfig(input: { workspaceId: string }) {
  return useQuery({
    ...$api.widget.get.queryOptions({ input }),
    enabled: !!input.workspaceId,
  });
}

export function useUpdateWidgetConfig() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.widget.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.widget.get.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}

export function useEnableWidget() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.widget.enable.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.widget.get.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
      void qc.invalidateQueries({
        queryKey: ["channels", "endpoints", "listByKind"],
      });
    },
  });
}
