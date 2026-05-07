# @kuralle/api-client

Thin re-export layer wrapping `@orpc/tanstack-query` per [AMENDMENT-001](../../sprints/AMENDMENT-001.md). Components never import this package directly — only hooks in `apps/web/src/hooks/api/**` may.

## Exports

- `createClient({ baseUrl })` — typed oRPC client (`AppRouterClient`) over fetch + cookie auth
- `createApi(client)` — TanStack Query utils factory (`$api`) for all procedures
- `AppRouter` / `AppRouterClient` types re-exported from `@kuralle/api`

## Rule

`import { … } from '@kuralle/api-client'` is **forbidden outside `apps/web/src/hooks/api/**`**. ESLint enforces this. See `apps/web/README.md` for the hook-wrapper pattern.
