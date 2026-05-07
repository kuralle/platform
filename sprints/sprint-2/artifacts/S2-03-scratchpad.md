# S2-03 Scratchpad

## Plan
1. Create 11 `.schemas.ts` files (one per router resource)
2. Update 10 non-agent routers to use explicit schemas
3. Rewrite agents.ts with 5 procedures
4. Extend Context type to include db + kvStore
5. Update server index.ts to wire db + kvStore
6. Add needed repository methods (findByAgentId with pagination)
7. Update eslint ignores
8. Create integration test
9. Regenerate openapi.json
10. Verify all checks

## Decisions
- Using z.date() for timestamps (oRPC handles JSON serialization)
- Using z.unknown() for jsonb (no specific jsonb schema needed for list output)
- Adding findByAgentId to AgentVersionRepository (needed by history procedure)
- Adding cursor-based pagination to findManyByWorkspace for AgentRepository
- MemoryKvStore for production for now (Node/CF stubs are not implemented)
- DB via createDb() using neon-http (works with local Postgres too)
