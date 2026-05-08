# apps/web — Kuralle frontend

TanStack Router SPA served by Vite via Cloudflare Pages.

## Frontend API access pattern

All API data access must go through typed hooks in `src/hooks/api/<resource>.ts`. Components never import from `@kuralle/api-client` directly — an ESLint `no-restricted-imports` rule enforces this.

### ✅ Good — hook wrapper

```ts
// src/hooks/api/health.ts
import { useQuery } from "@tanstack/react-query";
import { $api } from "@/providers/api-provider";

export function useHealthCheck() {
  return useQuery({
    ...$api.healthCheck.queryOptions(),
    refetchInterval: 30_000,
  });
}
```

```tsx
// In any component:
import { useHealthCheck } from "@/hooks/api/health";
const { data } = useHealthCheck();
```

### ❌ Rejected — direct client import

```tsx
// DO NOT do this — ESLint will reject it:
import { createClient } from "@kuralle/api-client";
const client = createClient({ baseUrl: "..." });
const { data } = useQuery(client.healthCheck.queryOptions());
```

The hook is the contract. The underlying oRPC/TanStack Query client is an implementation detail.

## Conversation live wiring

Conversation detail screens use two hook paths:

- `useConversation` loads the baseline bundle (`conversation`, `turns`, `toolCalls`, `extractedFields`, `evals`).
- `useConversationLive` requests `conversations.live` in polling mode at 1 Hz and merges new turns into the baseline set by `ordinal`.

Streaming via `eventIterator` is preferred when server/client exports are available, but the current implementation runs the polling fallback contract from the API (`{ kind: 'polling', sinceSequence, nextSequence, items }`) so reconnects remain deterministic. If live updates stall, inspect `useConversationLive` state in React DevTools and verify `nextSequence` is increasing.
