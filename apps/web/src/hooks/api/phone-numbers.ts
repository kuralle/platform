import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns WhatsApp phone-number endpoints for a workspace.
 * Wraps `channels.endpoints.listByKind({ kind: 'whatsapp' })`.
 */
export function usePhoneNumbers(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "whatsapp" },
    }),
    enabled: !!input.workspaceId,
  });
}
