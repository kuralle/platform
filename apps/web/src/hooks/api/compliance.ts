import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useCompliancePosture(input: { workspaceId: string }) {
  return useQuery({
    ...$api.compliance.getPosture.queryOptions({ input }),
    enabled: !!input.workspaceId,
  });
}

export function useUpdateCompliancePosture() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.compliance.updatePosture.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.compliance.getPosture.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}
