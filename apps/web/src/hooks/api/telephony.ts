import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns telephony (voice) channel endpoints for a workspace.
 * Wraps `channels.endpoints.listByKind({ kind: 'telephony' })` — the per-kind
 * endpoint lookup landed in S3-01. Consumers expect the endpoint shape
 * (identifier, attachedAgentId, metadata), not the connection shape.
 */
export function useTelephony(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "telephony" },
    }),
  });
}
