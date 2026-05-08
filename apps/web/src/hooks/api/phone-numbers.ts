import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns telephony phone-number endpoints for a workspace.
 * Wraps `channels.endpoints.listByKind({ kind: 'telephony' })` — the per-kind
 * endpoint lookup landed in S3-01. The phone-numbers screen consumes the
 * endpoint shape (identifier, attachedAgentId, metadata).
 */
export function usePhoneNumbers(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "telephony" },
    }),
  });
}
