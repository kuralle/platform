import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "@kuralle/api/routers/index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  closePool,
  createTestDb,
  releaseTestDb,
  resetSchema,
} from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import type { Context } from "@kuralle/api/context";
import {
  conversations,
  conversationTurns,
  conversationToolCalls,
  conversationExtractedFields,
  conversationEvals,
} from "@kuralle/db/schema";

type ProcedureLike = {
  "~orpc": {
    handler: (opts: { input: unknown; context: Context }) => Promise<unknown>;
  };
};

async function call<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  return (procedure as ProcedureLike)["~orpc"].handler({ input, context }) as Promise<T>;
}

describe("conversations router", () => {
  const workspaceId = "org_test_s3_05";
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;
  let ctx: Context;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  afterAll(async () => {
    await releaseTestDb(client);
    await closePool();
  });

  beforeEach(async () => {
    kvStore = new MemoryKvStore();
    await resetSchema(client, workspaceId);
    ctx = {
      auth: null,
      session: null,
      db,
      kvStore,
      env: {
        META_APP_ID: "",
        META_APP_SECRET: "",
        META_SYSTEM_USER_TOKEN: "",
        META_VERIFY_TOKEN: "",
        META_PHONE_NUMBER_ID: "",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
    };
  });

  it("list paginates with cursor", async () => {
    await db.insert(conversations).values([
      {
        id: "cv_list_1",
        workspaceId,
        channelKind: "whatsapp",
        threadKey: "whatsapp:1",
        startedAt: new Date("2026-01-01T00:00:03.000Z"),
      },
      {
        id: "cv_list_2",
        workspaceId,
        channelKind: "whatsapp",
        threadKey: "whatsapp:2",
        startedAt: new Date("2026-01-01T00:00:02.000Z"),
      },
      {
        id: "cv_list_3",
        workspaceId,
        channelKind: "whatsapp",
        threadKey: "whatsapp:3",
        startedAt: new Date("2026-01-01T00:00:01.000Z"),
      },
    ]);

    const page1 = await call<{ items: Array<{ id: string }>; cursor: string | null }>(
      appRouter.conversations.list,
      { workspaceId, limit: 2, cursor: null },
      ctx,
    );

    expect(page1.items.map((item) => item.id)).toEqual(["cv_list_1", "cv_list_2"]);
    expect(page1.cursor).toBeTruthy();

    const page2 = await call<{ items: Array<{ id: string }>; cursor: string | null }>(
      appRouter.conversations.list,
      { workspaceId, limit: 2, cursor: page1.cursor },
      ctx,
    );

    expect(page2.items.map((item) => item.id)).toEqual(["cv_list_3"]);
    expect(page2.cursor).toBeNull();
  });

  it("get returns detail bundle counts", async () => {
    await db.insert(conversations).values({
      id: "cv_get_1",
      workspaceId,
      channelKind: "whatsapp",
      threadKey: "whatsapp:get",
    });
    await db.insert(conversationTurns).values([
      {
        id: "ct_get_1",
        conversationId: "cv_get_1",
        ordinal: 1,
        speaker: "caller",
        text: "hello",
        timestampSec: 0,
      },
      {
        id: "ct_get_2",
        conversationId: "cv_get_1",
        ordinal: 2,
        speaker: "agent",
        text: "hi",
        timestampSec: 1,
      },
    ]);
    await db.insert(conversationToolCalls).values({
      id: "tc_get_1",
      turnId: "ct_get_2",
      toolName: "lookup",
    });
    await db.insert(conversationExtractedFields).values({
      conversationId: "cv_get_1",
      label: "intent",
      value: "booking",
    });
    await db.insert(conversationEvals).values({
      id: "ev_get_1",
      conversationId: "cv_get_1",
      rubricSnapshot: "rubric",
    });

    const detail = await call<{
      conversation: { id: string };
      turns: unknown[];
      toolCalls: unknown[];
      extractedFields: unknown[];
      evals: unknown[];
    }>(
      appRouter.conversations.get,
      { workspaceId, conversationId: "cv_get_1" },
      ctx,
    );

    expect(detail.conversation.id).toBe("cv_get_1");
    expect(detail.turns).toHaveLength(2);
    expect(detail.toolCalls).toHaveLength(1);
    expect(detail.extractedFields).toHaveLength(1);
    expect(detail.evals).toHaveLength(1);
  });

  it("live polling returns turns after sequence", async () => {
    await db.insert(conversations).values({
      id: "cv_live_1",
      workspaceId,
      channelKind: "whatsapp",
      threadKey: "whatsapp:live",
    });
    await db.insert(conversationTurns).values([
      {
        id: "ct_live_1",
        conversationId: "cv_live_1",
        ordinal: 1,
        speaker: "caller",
        text: "one",
        timestampSec: 0,
      },
      {
        id: "ct_live_2",
        conversationId: "cv_live_1",
        ordinal: 2,
        speaker: "agent",
        text: "two",
        timestampSec: 1,
      },
    ]);

    const first = await call<{ items: Array<{ id: string }>; nextSequence: number }>(
      appRouter.conversations.live,
      { workspaceId, conversationId: "cv_live_1", sinceSequence: 0 },
      ctx,
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextSequence).toBe(2);

    const second = await call<{ items: unknown[]; nextSequence: number }>(
      appRouter.conversations.live,
      { workspaceId, conversationId: "cv_live_1", sinceSequence: 2 },
      ctx,
    );
    expect(second.items).toHaveLength(0);
    expect(second.nextSequence).toBe(2);
  });
});
