# Spec + Code-Quality Gate — `S1-06` Calderon HVAC seed + personal-org metadata

> **Gate worker:** pi/kimi-k2.6.  
> **IC worker:** pi-glm (zai / glm-5.1).  
> **Commit reviewed:** `3393bf5`.  
> **Inputs:** brief-S1-06.md, PLAN.md §S1-06, result-S1-06.txt, diff on disk, DATA_MODEL.md §3/§5/§8/§9/§11, mock files, create-kuralle-auth.ts, prior gates S1-01..S1-04.  
> **Verdict:** 🟡 yellow

---

## 1. Spec adherence

### 1.1 Brief ACs 1–16

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Seed is idempotent — runs twice → same row counts | ✅ | Re-run `bun -F @kuralle/db db:seed` shows 0 new rows. `seed-idempotency-check.ts` exits 0 with all 9 tables matching (`S1-06-seed-idempotency.txt`). Every INSERT uses `ON CONFLICT (id) DO NOTHING`. |
| 2 | Deterministic IDs with fixed namespace prefixes | ✅ | Grep of `seed-calderon.ts` finds zero `nanoid`, `randomUUID`, or `Math.random`. IDs: `ws_calderon`, `ag_calderon_*`, `av_calderon_*_v1`, `ch_calderon_voice`, `ce_calderon_e164_main`, `cv_calderon_001..005`, `cvt_001_1..cvt_005_6`, `kb_calderon_pricing_q4`, `wh_calderon_main`. |
| 3 | Workspace row matches `DATA_MODEL.md §3` | ✅ | `organization` query: `id='ws_calderon'`, `name='Calderon HVAC'`, `slug='calderon-hvac'`, `environment='production'`, `region='us-east-1'`, `compliance_mode='tcpa'`, `metadata='{"vertical":"home-services"}'`, `vertical='home-services'`, `is_personal=false`. `created_at` and `updated_at` both set to frozen `BASE_DATE` (`2026-04-01T10:00:00.000Z`). |
| 4 | 3 agents with published agent_versions, snapshot shape, chicken-and-egg | ✅ | 3 agents inserted with `active_version_id=NULL`, then 3 `agent_versions` rows with `version_number=1`, `version_kind='publish'`, `published_at=BASE_DATE`. `UPDATE agents SET active_version_id=... WHERE active_version_id IS NULL` links them. Active version IDs verified in DB. |
| 5 | 1 voice `channel_connections` (mock Twilio) | ✅ | `id='ch_calderon_voice'`, `channel_kind='voice'`, `provider='twilio-native'`, `status='connected'`, `config='{"twilioAccountSid":"AC_DEMO","mockMode":true}'`. |
| 6 | 1 phone-number `channel_endpoints` — polymorphic trigger | ✅ | `id='ce_calderon_e164_main'`, `channel_kind='voice'` (matches connection), `identifier='+15559870001'`, `attached_agent_id='ag_calderon_dispatcher'`, `attached_agent_version_id='av_calderon_dispatcher_v1'`. Seed ran clean on both first and second pass — trigger did not fire. |
| 7 | 5 historical `conversations` + 4-6 turns each, alternating speakers, message_id=NULL | ❌ missed | **Turn count violation:** `cv_calderon_003` has 3 turns and `cv_calderon_004` has 3 turns. Brief explicitly requires "4-6 conversation_turns" per conversation. All other requirements met: alternating speakers ✅, ordinals 1..N ✅, `message_id=NULL` ✅ (verified `IS NULL` in DB), text sourced from domain mocks ✅. |
| 8 | 1 `kb_documents` | ✅ | `id='kb_calderon_pricing_q4'`, `source='file'`, `size_bytes=42000`, `status='ready'`, `rag_indexed=true`, `embedding_model='openai-text-embedding-3-large'`, `created_by_user_id=NULL`. |
| 9 | 1 `webhooks` | ✅ | `id='wh_calderon_main'`, `url='https://hooks.calderonhvac.com/api/calls'`, `events=['conversation.completed','batch.completed']`, `signing_secret='whsec_demo_calderon_seed'`, `active=true`. |
| 10 | All inserts respect CHECK constraints S1-01..S1-04 | ✅ | All values verified against live DB: `environment='production'`, `region='us-east-1'`, `compliance_mode='tcpa'`, `agents.status='published'`, `agent_versions.version_kind='publish'`, `kb_documents.source='file'`, `kb_documents.status='ready'`, `voices.provider` not used in seed (channel_connections uses `twilio-native` which is not constrained by `voices_provider_check` — acceptable), `channel_connections.status='connected'`, `channel_endpoints.channel_kind='voice'`, `conversations.direction='inbound'`, `conversations.outcome IN ('booked','qualified','missed','voicemail','escalated')`, `conversation_turns.speaker IN ('agent','caller')`. All within CHECK tuples. |
| 11 | Personal-org metadata flag | ✅ | `packages/auth/src/create-kuralle-auth.ts:150` — `metadata: JSON.stringify({ personal: true })` added to `createOrganization` call. Verified in DB: `metadata='{"personal":true}'` on latest personal org. Smoke-local still passes. Surgical: exactly 1 field added, no other refactors. |
| 12 | Type-check + lint green | ✅ | `bun run check-types --force`: 6/6 green. `bun run lint`: 0 errors, 1 pre-existing warning (`packages/env/src/web.ts`). Seed uses `catch (err: unknown)` with `err instanceof Error` narrowing. |
| 13 | OpenAPI drift gate green | ✅ | `bun -F server gen:openapi --check` clean. No router changes. |
| 14 | All prior smokes still green | ✅ | `smoke-S1-01.ts` GREEN. `smoke-S1-02.ts` GREEN (16 passed). `smoke-S1-03.ts` GREEN (28 passed). `smoke-S1-04.ts` GREEN (41 passed). Seed's `ON CONFLICT` logic does not interact with smoke test-prefixed rows. |
| 15 | Demo artifacts captured | ✅ | `S1-06-seed-counts.txt` shows first run 39 rows + second run 0 rows. `S1-06-seed-idempotency.txt` shows PASS with all 9 table comparisons matching. |
| 16 | Atomic commit — body covers ID schema, idempotency, snapshot, trigger, metadata, trade-offs | ✅ | Commit `3393bf5` body documents all required topics. 6 files changed, all within scope. |

### 1.2 Project-specific spec gates (standing rules from prior gates)

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| **A** | Idempotency proof — re-run produces 0 new rows | ✅ | Re-run `bun -F @kuralle/db db:seed` output: every block reports `0 row(s)`, total `0`. `seed-idempotency-check.ts` exits 0. |
| **B** | Deterministic IDs — no `nanoid`/`randomUUID`/`Math.random` | ✅ | Grep returns no matches across `seed-calderon.ts` and `seed-idempotency-check.ts`. |
| **C** | CHECK-constraint compliance — every enum-text value in CHECK set | ✅ | All 9 seeded tables' enum columns verified against `pg_constraint` CHECK tuples. No violations. |
| **D** | Personal-org metadata flag — surgical edit in `create-kuralle-auth.ts` | ✅ | Exactly one line added (`metadata: JSON.stringify({ personal: true })` at `create-kuralle-auth.ts:150`). No other refactors. `bun -F @kuralle/auth smoke-local` still passes. |
| **E** | WBS DoD line — UI screens render seeded data without code changes; document asymmetry | ⚠️ partial | The commit body does **not** document that only C1 agents list is wired to real data via S1-05's `useAgents()`, while B1, F1, /knowledge, /telephony, /phone-numbers still consume mocks. The brief §9 explicitly calls for documenting this asymmetry. |
| **F** | AgentIR snapshot shape grounded in `DATA_MODEL.md §5:347-365` | ✅ | Snapshot queried: 17 keys present (`name`, `description`, `instructions`, `model`, `defaultOptions`, `toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`, `kbAttachments`, `guardrailGraph`, `scorerAttachments`, `voiceConfig`, `channelConfig`, `complianceConfig`, `requestContextSchema`). Matches DATA_MODEL.md verbatim. No improvised wrapping. |
| **G** | No out-of-scope edits | ✅ | Diff touches exactly 6 files: 2 new scripts, 2 modifications, 2 demo artifacts. No `apps/web/`, no schema files, no landed migrations, no root `package.json`. |
| **H** | No `catch (e: any)` / lint 0 errors / no new warnings | ✅ | Seed: `catch (err: unknown)` at `seed-calderon.ts:265`. Idempotency check: `catch ((err: unknown) => ...)` at `seed-idempotency-check.ts:82`. Lint: 0 errors, 1 pre-existing warning unchanged. |
| **I** | Polymorphic-trigger compliance — `channel_endpoints` kind matches connection | ✅ | Seed ran clean twice. `channel_endpoints.channel_kind='voice'` matches `channel_connections.channel_kind='voice'`. Attachment CHECK satisfied (`attached_agent_id IS NOT NULL`). |
| **J** | Conversations + turns shape parity with mocks | ⚠️ partial | Alternating speakers ✅, ordinals 1..N ✅, `message_id=NULL` ✅. **Turn count miss:** `cv_calderon_003` and `cv_calderon_004` have 3 turns (below 4-6 minimum). Turn timestamps per conversation (0,5,9,14,18,23) reset per conversation and do not span the conversation's `duration_sec` (cv_003: 42s, cv_004: 18s). Documented in trade-offs but still a logical inconsistency. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/scripts/seed-calderon.ts` | ✅ created |
| `packages/db/scripts/seed-idempotency-check.ts` | ✅ created |
| `packages/db/package.json` | ✅ modified (`db:seed` script) |
| `packages/auth/src/create-kuralle-auth.ts` | ✅ modified (1 line: `metadata: JSON.stringify({ personal: true })`) |
| `sprints/sprint-1/artifacts/S1-06-seed-counts.txt` | ✅ created |
| `sprints/sprint-1/artifacts/S1-06-seed-idempotency.txt` | ✅ created |

Out-of-scope edits: **none**.

---

## 3. Wiring + demo artifact verification

- **`packages/db/package.json`** — `"db:seed": "bun scripts/seed-calderon.ts"` resolves correctly under `bun -F @kuralle/db db:seed` (working directory is `packages/db`). ✅
- **`S1-06-seed-counts.txt`** — Shows first run 39 new rows + second run 0 new rows + final per-table counts (organization:1, agents:3, agent_versions:3, channel_connections:1, channel_endpoints:1, conversations:5, conversation_turns:23, kb_documents:1, webhooks:1). ✅
- **`S1-06-seed-idempotency.txt`** — Shows PASS after two seed runs with identical counts across all 9 tables. ✅
- **Personal-org metadata** — `create-kuralle-auth.ts:150` adds `metadata: JSON.stringify({ personal: true })` to the `createOrganization` call inside `databaseHooks.user.create.after`. Live DB query confirms `"{\"personal\":true}"` on the latest smoke org. ✅

---

## 4. Code quality

- **`packages/db/scripts/seed-calderon.ts:93-95`** — `timestampSec` resets to `0` for every conversation, producing identical turn timestamps (`0, 5, 9, 14, 18, 23`) across all 5 conversations. This does not span the conversation's `duration_sec` (e.g., cv_003 has `durationSec=42` but turns end at 14s). Documented in trade-offs but is a logical inconsistency in the seeded data. **Minor**.
- **`packages/db/scripts/seed-calderon.ts:228`** — `turnId = \`cvt_${cv.id.slice(-3)}_${i + 1}\`` is deterministic but fragile: it assumes `cv.id` always ends in 3 digits. Acceptable for a fixed seed. **Nit**.
- **`packages/db/scripts/seed-calderon.ts:187`** — `cv.turns[i]!` non-null assertion is safe (bounds-checked by `i < cv.turns.length`) but slightly smelly. **Nit**.
- **`packages/db/scripts/seed-idempotency-check.ts:42`** — `execSync("bun " + path.resolve(__dirname, "seed-calderon.ts"), ...)` will break if the path contains spaces. Acceptable for a fixed monorepo layout. **Nit**.
- **No `any` casts, no dead imports, no dead branches.** `catch (err: unknown)` narrowing used correctly throughout. TS camelCase / SQL snake_case consistent. ✅
- **Comments:** Near-zero in source files (matches project style). Commit body is thorough and honest about trade-offs, with one gap (UI asymmetry, see Gate E). ✅

---

## 5. Honest summary

The seed is solid on its core promise: idempotent, deterministic, CHECK-clean, and polymorphic-trigger-safe. All 9 resource types are created with correct IDs, correct FK wiring (including the chicken-and-egg `agents.active_version_id` pattern from S1-02), and correct enum values. The personal-org metadata edit is exactly one line, verified in the database, and doesn't break the S0 smoke. Type-check, lint, prior smokes, and OpenAPI drift are all green. The AgentIR snapshot is a full 17-key jsonb document grounded in `DATA_MODEL.md §5:347-365` with no improvisation.

The one clear spec miss is AC 7: two of the five seeded conversations (`cv_calderon_003` and `cv_calderon_004`) have only 3 turns each, below the brief's explicit "4-6" range. This is a copy-paste drift in the `CONVERSATIONS` array — both entries were given 3-turn arrays instead of being padded to the minimum 4. The fix is trivial (add 1-2 more turns to each).

A secondary gap is documentation: the commit body does not disclose that only the C1 agents list screen is actually wired to the seeded data via S1-05's `useAgents()` hook, while B1, F1, /knowledge, /telephony, and /phone-numbers still consume mocks. The brief §9 explicitly asks the IC to document this asymmetry.

Neither miss blocks downstream stories, but AC 7 is a brief violation that should be fixed before the sprint gate closes.

---

## 6. Recommended action

**Needs manager fix-pass.** The fix is surgical: add 1-2 turns to `cv_calderon_003` and `cv_calderon_004` in `seed-calderon.ts` and update the commit body to document the UI asymmetry. No IC re-fire needed.

---

## 7. Apply-now items

### 1. `packages/db/scripts/seed-calderon.ts:110-125` — Add turns to `cv_calderon_003` to reach the 4-6 minimum

The `cv_calderon_003` entry currently has 3 turns. Add at least 1 more to meet the 4-turn minimum. For example, after the existing 3rd turn, add:

```ts
{ speaker: "caller", text: "Actually, never mind. I'll figure it out." },
{ speaker: "agent", text: "No problem at all — feel free to call back anytime if you need us." },
```

This brings it to 5 turns, within the 4-6 range.

### 2. `packages/db/scripts/seed-calderon.ts:126-136` — Add turns to `cv_calderon_004` to reach the 4-6 minimum

The `cv_calderon_004` entry currently has 3 turns. Add at least 1 more. For example, after the 3rd turn, add:

```ts
{ speaker: "caller", text: "..." },
{ speaker: "agent", text: "Please call us back at your earliest convenience. Have a great day." },
```

This brings it to 5 turns.

### 3. Commit body / `result-S1-06.txt` — Document the UI asymmetry

Add an explicit sentence:

> "S1-05 only wired `useAgents()` for the C1 agents list screen. B1 home, F1 conversations, /knowledge, /telephony, and /phone-numbers still consume mock fixtures — they will be wired to real routers in S2."

This satisfies brief §9's explicit request to document the asymmetry.
