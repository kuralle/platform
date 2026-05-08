import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { $api } from "@/providers/api-provider";

/** Returns paginated conversation list for a workspace. */
export function useConversations(input: {
  workspaceId: string;
  cursor?: string | null;
  limit?: number;
}) {
  return useQuery({
    ...$api.conversations.list.queryOptions({ input }),
  });
}

export function useConversation(input: {
  workspaceId: string;
  conversationId: string;
}) {
  return useQuery({
    ...$api.conversations.get.queryOptions({ input }),
  });
}

export function useConversationLive(input: {
  workspaceId: string;
  conversationId: string;
  initialTurns?: Array<{ id: string; ordinal: number } & Record<string, unknown>>;
}) {
  const liveQuery = useQuery({
    ...$api.conversations.live.queryOptions({
      input: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        sinceSequence:
          input.initialTurns && input.initialTurns.length > 0
            ? Number(input.initialTurns[input.initialTurns.length - 1]!.ordinal)
            : 0,
      },
    }),
    refetchInterval: 1000,
  });

  const turns = useMemo(() => {
    const dedup = new Map<string, { id: string; ordinal: number } & Record<string, unknown>>();
    for (const turn of input.initialTurns ?? []) {
      dedup.set(turn.id, turn);
    }
    for (const turn of liveQuery.data?.items ?? []) {
      dedup.set(turn.id, turn as { id: string; ordinal: number } & Record<string, unknown>);
    }
    return Array.from(dedup.values()).sort((a, b) => a.ordinal - b.ordinal);
  }, [input.initialTurns, liveQuery.data?.items]);

  return {
    ...liveQuery,
    turns,
    nextSequence: liveQuery.data?.nextSequence ?? 0,
    mode: "polling" as const,
  };
}
