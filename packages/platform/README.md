# @kuralle/platform

Hexagonal ports & adapters for the Kuralle voice platform.

## Ports (from `HEXAGONAL_ARCHITECTURE.md §2`)

Eight TypeScript interfaces in `src/interface.ts`:

| Port | Purpose |
|---|---|
| `KvStore` | Hot config cache |
| `BlobStore` | Durable binary storage |
| `MessageQueue` | Sink path for events |
| `RuntimePlatform` | Agent execution (voice + messaging + diagnostics) |
| `SessionStore` | Per-conversation runtime state (AriaFlow-owned) |
| `AuthAdapter` | better-auth session resolution |
| `ActorHost` | Generic actor primitive |
| `LlmGateway` | LLM provider proxy |

## Adapters

| Adapter | Subpath | Status |
|---|---|---|
| **Interface (types only)** | `@kuralle/platform/interface` | S0 |
| **Memory (in-memory, Map-backed)** | `@kuralle/platform/memory` | S0 — fully implemented; used by all domain tests |
| **Cloudflare** | `@kuralle/platform/cloudflare` | S0 — stubs only (throw `not-implemented`); real impl lands S3–S5 |
| **Node** | `@kuralle/platform/node` | S0 — stubs only (throw `not-implemented`); real impl lands S5 |

## Discipline rules (from `HEXAGONAL_ARCHITECTURE.md §6`)

1. No file in `core/`, `api/`, `db/`, or `runtime/` may import from `./cloudflare` or `./node`.
   Only `./interface` is allowed. ESLint-enforced.
2. Both adapters build in CI, every PR.
3. The in-memory adapter is not optional — every port has a Map-backed implementation.
4. Ports never leak adapter types into the interface.

## Contract test

```bash
bun -F @kuralle/platform test
```

Runs `src/memory/contract.test.ts` — exercises every port against the memory adapter.
