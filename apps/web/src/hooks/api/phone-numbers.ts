import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns voice (telephony) phone-number endpoints for a workspace.
 * Wraps `channels.endpoints.listByKind({ kind: 'voice' })` — telephony
 * numbers store under the 'voice' channel_kind per
 * `0008_s1_03_meta.sql` + DATA_MODEL.md §8. The phone-numbers screen
 * consumes the endpoint shape (identifier, attachedAgentId, metadata).
 */
export function usePhoneNumbers(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "voice" },
    }),
    enabled: !!input.workspaceId,
  });
}
