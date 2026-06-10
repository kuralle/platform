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
    enabled: !!opts.workspaceId,
  });
}

export function useChannelEndpoints(opts: {
  workspaceId: string;
  connectionId: string;
}) {
  return useQuery({
    ...$api.channels.endpoints.list.queryOptions({ input: opts }),
    enabled: !!opts.workspaceId && !!opts.connectionId,
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
    onSuccess: (data, variables) => {
      // Invalidate the connection-scoped endpoint list using the
      // server-returned connectionId (mutation input only carries
      // endpointId + workspaceId). Kimi-gate fix-pass for the
      // broken `connectionId: ""` query key.
      if (data.connectionId) {
        void qc.invalidateQueries({
          queryKey: $api.channels.endpoints.list.queryKey({
            input: {
              workspaceId: variables.workspaceId,
              connectionId: data.connectionId,
            },
          }),
        });
      }
      // Cross-kind endpoint lists (telephony / whatsapp screens) reset
      // via a prefix-match invalidation on the listByKind subtree.
      void qc.invalidateQueries({
        queryKey: ["channels", "endpoints", "listByKind"],
      });
    },
  });
}

export function useChannelStatus(opts: {
  workspaceId: string;
  endpointId: string;
}) {
  return useQuery({
    ...$api.channels.status.queryOptions({ input: opts }),
    enabled: !!opts.workspaceId && !!opts.endpointId,
  });
}

export function useWebhookInfo(opts: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.webhookInfo.queryOptions({ input: opts }),
    enabled: !!opts.workspaceId,
  });
}

export function useBindAgent() {
  const qc = useQueryClient();
  return useMutation({
    ...$api.channels.bindAgent.mutationOptions(),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({
        queryKey: $api.channels.status.queryKey({
          input: {
            workspaceId: variables.workspaceId,
            endpointId: variables.endpointId,
          },
        }),
      });
      void qc.invalidateQueries({
        queryKey: ["channels", "endpoints", "listByKind"],
      });
    },
  });
}
