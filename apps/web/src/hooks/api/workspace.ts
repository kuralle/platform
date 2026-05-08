import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useWorkspaceSettings(input: { workspaceId: string }) {
  return useQuery({
    ...$api.workspace.get.queryOptions({ input }),
  });
}

export function useUpdateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.workspace.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.workspace.get.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}
