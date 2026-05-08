import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useBatches(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
  status?: string;
}) {
  return useQuery({
    ...$api.batches.list.queryOptions({ input }),
  });
}

export function useBatch(input: {
  workspaceId: string;
  batchId: string;
}) {
  return useQuery({
    ...$api.batches.get.queryOptions({ input }),
  });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.batches.create.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.batches.list.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}
