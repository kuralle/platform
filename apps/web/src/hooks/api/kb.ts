import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useKb(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.kb.list.queryOptions({ input }),
    enabled: !!input.workspaceId,
  });
}

export function useKbDocument(input: { workspaceId: string; docId: string }) {
  return useQuery({
    ...$api.kb.get.queryOptions({ input }),
    enabled: !!input.workspaceId && !!input.docId,
  });
}

export function useUpdateKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.kb.update.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.kb.list.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
      void qc.invalidateQueries({
        queryKey: $api.kb.get.queryKey({
          input: { workspaceId: variables.workspaceId, docId: variables.docId },
        }),
      });
    },
  });
}

export function useDeleteKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.kb.delete.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.kb.list.queryKey({ input: { workspaceId: variables.workspaceId } }),
      });
    },
  });
}

export function useKbAttached(input: { workspaceId: string; agentId: string }) {
  return useQuery({
    ...$api.kb.listAttached.queryOptions({ input }),
    enabled: !!input.workspaceId && !!input.agentId,
  });
}

export function useAttachKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.kb.attach.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.kb.listAttached.queryKey({
          input: { workspaceId: variables.workspaceId, agentId: variables.agentId },
        }),
      });
    },
  });
}

export function useDetachKbDocument() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.kb.detach.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.kb.listAttached.queryKey({
          input: { workspaceId: variables.workspaceId, agentId: variables.agentId },
        }),
      });
    },
  });
}
