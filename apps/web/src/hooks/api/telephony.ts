import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns voice (telephony) channel endpoints for a workspace.
 * Wraps `channels.list` filtered for voice channels — no dedicated telephony
 * router exists as of S2-04. Flag: if a telephony-specific endpoint evolves
 * (e.g. channels.endpoints.list with channelKind filter server-side), update.
 */
export function useTelephony(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.channels.list.queryOptions({ input }),
  });
}
