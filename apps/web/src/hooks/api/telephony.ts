import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/**
 * Returns telephony (voice) channel endpoints for a workspace.
 * Wraps `channels.endpoints.listByKind({ kind: 'voice' })` — the per-kind
 * endpoint lookup landed in S3-01. The valid `channel_kind` enum (per
 * `0008_s1_03_meta.sql` + DATA_MODEL.md §8) is
 * voice/whatsapp/messenger/instagram/web_chat/sms — there's no 'telephony'
 * kind; telephony channels store as 'voice'.
 */
export function useTelephony(input: { workspaceId: string }) {
  return useQuery({
    ...$api.channels.endpoints.listByKind.queryOptions({
      input: { workspaceId: input.workspaceId, kind: "voice" },
    }),
    enabled: !!input.workspaceId,
  });
}
