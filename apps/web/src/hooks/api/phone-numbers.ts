import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns phone-number channel endpoints for a workspace.
 * Wraps `channels.list` — no dedicated phoneNumbers router exists as of S2-04.
 * Flag: DATA_MODEL.md §8 maps phone numbers to channel_endpoints; when a
 * dedicated `phoneNumbers` router lands (S3+), switch this wrapper.
 */
export function usePhoneNumbers(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.channels.list.queryOptions({ input }),
  });
}
