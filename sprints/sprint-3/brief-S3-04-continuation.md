# Story Brief — `S3-04` continuation (resume from blocker)

> **Role.** You are the same senior runtime engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) that flagged the schema blocker on the original S3-04 brief. You stopped before implementation per the brief's instruction. The manager has decided **option A — focused migration**. Resume from where you stopped, adopt the resolution below, and finish the story.
>
> **Mindset + standards + boundaries:** unchanged from `sprints/sprint-3/brief-S3-04.md`. Read that brief in full before continuing.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-04] runtime/projector: 16-shard consumer + Node BullMQ adapter + idempotent conversation projection`. Do NOT push. **You MUST commit before exiting** — the original brief's commit-policy still applies.

---

## 1. The blocker you flagged

Your transcript:

> `conversation_turns` in `packages/db/src/schema/conversations.ts` has **no `(channel_endpoint_id, message_id)` unique index** (and no `channel_endpoint_id` column on that table at all). Current uniqueness is `(conversation_id, ordinal)` only, and there is also no unique `(conversation_id, message_id)` index in schema.

Verified — your read is correct. The brief's assumption traced back to a `DATA_MODEL.md §9` line that aspires-to but doesn't enforce that index in the current schema.

---

## 2. Manager's decision: option A — focused migration

Add a **partial unique index** keyed by `(conversation_id, message_id) WHERE message_id IS NOT NULL`. Rationale:

- `channel_endpoint_id` is derivable from `conversation_id` via `messaging_threads` (1-to-1 within an active conversation). So dedup keyed by `(conversation_id, message_id)` is **functionally equivalent** to the brief's `(channel_endpoint_id, message_id)` for webhook-replay correctness.
- The partial predicate (`WHERE message_id IS NOT NULL`) prevents NULL × NULL collisions for non-WhatsApp-sourced turns (e.g., voice or web_chat turns may not carry a Meta message_id).
- `channel_endpoint_id` is NOT added to `conversation_turns` — that would denormalize the conversation graph, increase write paths, and complicate FK semantics. Out of scope for S3-04.

The projector's idempotency key is therefore `(conversationId, messageId)`, applied via `.onConflictDoNothing()` in the Drizzle insert. Update the brief's references to `(channel_endpoint_id, message_id)` accordingly throughout your implementation.

---

## 3. The migration

Create `packages/db/src/migrations/0014_s3_04_conversation_turns_message_id_uidx.sql` (next migration after `0013_s3_01_meta.sql`):

```sql
-- S3-04: idempotency unique index for conversation_turns inbound replay dedup.
-- Per DATA_MODEL.md §9 — webhook deliveries can replay; the projector relies
-- on this partial unique index to make `INSERT ... ON CONFLICT DO NOTHING`
-- a no-op on the second arrival of the same Meta message_id.
--
-- Partial predicate (`WHERE message_id IS NOT NULL`) lets non-Meta-sourced
-- turns (voice, web_chat) leave message_id NULL without colliding.

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS conversation_turns_conversation_message_id_uidx
  ON conversation_turns (conversation_id, message_id)
  WHERE message_id IS NOT NULL;
```

Verify the migration applies cleanly:
```bash
bun -F @kuralle/db db:migrate
```

Update `packages/db/src/migrations/meta/_journal.json` per the existing journal pattern (drizzle-kit format — IC verifies exact shape from the existing journal).

Also update the Drizzle schema at `packages/db/src/schema/conversations.ts` to declare the new index in the table builder so future drizzle-kit runs don't try to drop it:

```ts
export const conversationTurns = pgTable(
  "conversation_turns",
  {
    /* ... existing columns ... */
  },
  (table) => [
    uniqueIndex("conversation_turns_conversation_ordinal_uidx").on(
      table.conversationId,
      table.ordinal,
    ),
    // S3-04: partial unique for webhook-replay dedup. The predicate is
    // applied in the hand-authored migration; declared here for parity.
    uniqueIndex("conversation_turns_conversation_message_id_uidx").on(
      table.conversationId,
      table.messageId,
    ).where(sql`message_id IS NOT NULL`),
  ],
);
```

(Verify the `.where(sql\`...\`)` syntax against `node_modules/.bun/drizzle-orm@*/dist/pg-core/*.d.ts` — drizzle-orm partial-index API is version-sensitive. If the syntax differs, adopt what's actually exported and document.)

---

## 4. Updated acceptance criterion (replaces brief §4.2)

**§4.2 (revised):** Idempotency: `turn.end` events with the same `(conversationId, messageId)` produce zero second rows. Verified by replay test that publishes the same event twice and asserts only one `conversation_turns` row exists.

All other acceptance criteria (§4.1, §4.3 through §4.12) stand as written in `brief-S3-04.md`.

---

## 5. Resume from here

1. Apply the migration (above).
2. Update the schema file.
3. Implement the projector + worker per the original brief, with `(conversationId, messageId)` as the dedup key.
4. Implement the Node BullMQ adapter per the original brief.
5. Capture the demo artifact at `sprints/sprint-3/artifacts/S3-04-projector-throughput.txt`.
6. Run the full test chain.
7. Commit atomically.

Commit body must additionally note the schema-decision rationale (option A; `(conversation_id, message_id)` partial unique; `channel_endpoint_id` not added to `conversation_turns` because it's derivable via `messaging_threads`).

If you hit ANOTHER blocker that contradicts the original brief, **stop and ask again** — do not improvise. The S3-01 silent-failure precedent showed that improvising past contradictions creates worse downstream issues than pausing.
