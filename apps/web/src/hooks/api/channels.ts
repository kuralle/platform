import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

export function useChannels(opts: {
  workspaceId: string;
  kind?: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.channels.list.queryOptions({ input: opts }),
  });
}

export function useChannelEndpoints(opts: {
  workspaceId: string;
  connectionId: string;
}) {
  return useQuery({
    ...$api.channels.endpoints.list.queryOptions({ input: opts }),
  });
}

export function useConnectMetaChannel() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.channels.connect.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.channels.list.queryKey({
          input: { workspaceId: variables.workspaceId },
        }),
      });
    },
  });
}

export function useAttachEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.channels.endpoints.attach.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.channels.endpoints.list.queryKey({
          input: {
            workspaceId: variables.workspaceId,
            connectionId: variables.connectionId,
          },
        }),
      });
    },
  });
}

export function useDetachEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.channels.endpoints.detach.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.channels.endpoints.list.queryKey({
          input: { workspaceId: variables.workspaceId, connectionId: "" },
        }),
      });
    },
  });
}
