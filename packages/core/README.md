# @kuralle/core

Repository layer + domain schemas for the Kuralle voice platform. Part of the hexagonal architecture — imports only from `@kuralle/db`, `@kuralle/platform/interface`, `drizzle-orm`, and `zod`.

## Repositories

Six repositories, each constructed via the `withWorkspace(db, workspaceId, kvStore)` factory. The factory closure provides workspace scoping — no method takes `workspaceId` as a parameter. Every repository accepts the `KvStore` port from `@kuralle/platform/interface` for a Fowler PoEAA identity-map cache: `findById` consults the cache with a 60-second TTL; mutating methods (`insert`, `update`, `softDelete`) invalidate the affected cache key after the DB write completes.

| Repository | Table | softDelete | Notes |
|---|---|---|---|
| `AgentRepository` | `agents` | yes | Uses `(workspaceId, id)` scoping; cache key `repo:agent:<ws>:<id>` |
| `AgentVersionRepository` | `agent_versions` | no | Scoped through FK join with `agents.workspaceId`; append-only: `update()` throws `AppendOnlyViolation` |
| `KbDocumentRepository` | `kb_documents` + `kb_chunks` | yes | Chunk methods exercise the pgvector `embedding` column (BL-S1-VECTOR-ROUNDTRIP-TEST) |
| `ToolRepository` | `tools` | yes | Scoped by `workspaceId`; kind values restricted to `webhook` / `mcp` / `client` / `system` |
| `ChannelRepository` | `channel_connections` | yes | Scoped by `workspaceId`; kind values restricted to `voice` / `whatsapp` / `messenger` / `instagram` / `web_chat` / `sms` |
| `ConversationRepository` | `conversations` | no | No `deletedAt` column per `DATA_MODEL.md`; scoped by `workspaceId` |

## Error types

- **`AppendOnlyViolation`** — thrown by `AgentVersionRepository.update()` per `DATA_MODEL.md §15`.
- **`WorkspaceScopeViolation`** — defense-in-depth signal if a query returns a row from another workspace.

## Testing

Tests run against local Postgres (`postgres://kuralle:kuralle@localhost:5432/kuralle_dev`) using the memory `KvStore` adapter. The database must have migrations applied (`bun -F @kuralle/db db:migrate`). Tests use a per-test `TRUNCATE ... CASCADE` reset strategy with sequential execution to avoid deadlocks on shared tables.

```bash
bun -F @kuralle/core test
```
