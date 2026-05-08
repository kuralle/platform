import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { MemoryMessageQueue } from "@kuralle/platform/memory";
import * as schema from "@kuralle/db/schema";
import {
  closePool,
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspace,
  type PoolClient,
  type TestDb,
} from "@kuralle/core/test-utils";
import { generateConversationEvents } from "./__fixtures__/synthetic-events.js";
import { runProjectorWorker } from "./projector-worker.js";

let db: TestDb;
let client: PoolClient;

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
  client = setup.client;
});

afterAll(async () => {
  releaseTestDb(client);
  await closePool();
});

beforeEach(async () => {
  await resetSchema(client, "ws_worker");
  await seedWorkspace(db, { id: "ws_worker" });
  await db.insert(schema.agents).values({ id: "ag_worker", workspaceId: "ws_worker", status: "draft" });
  await db.insert(schema.channelConnections).values({
    id: "cc_worker",
    workspaceId: "ws_worker",
    channelKind: "whatsapp",
    provider: "meta-whatsapp-cloud",
    displayName: "WhatsApp",
    status: "connected",
    config: {},
  });
  await db.insert(schema.channelEndpoints).values({
    id: "ce_worker",
    workspaceId: "ws_worker",
    connectionId: "cc_worker",
    channelKind: "whatsapp",
    identifier: "pn_worker",
    attachedAgentId: "ag_worker",
  });

  await db.insert(schema.conversations).values([
    {
      id: "cv_worker_a",
      workspaceId: "ws_worker",
      agentId: "ag_worker",
      channelKind: "whatsapp",
      channelEndpointId: "ce_worker",
      threadKey: "whatsapp:a",
    },
    {
      id: "cv_worker_b",
      workspaceId: "ws_worker",
      agentId: "ag_worker",
      channelKind: "whatsapp",
      channelEndpointId: "ce_worker",
      threadKey: "whatsapp:b",
    },
  ]);
});

describe("runProjectorWorker", () => {
  async function waitForTurns(expected: number): Promise<void> {
    for (let i = 0; i < 30; i += 1) {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.conversationTurns)
        .where(inArray(schema.conversationTurns.conversationId, ["cv_worker_a", "cv_worker_b"]));
      if ((rows[0]?.count ?? 0) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  it(
    "projects events, keeps replay idempotent, and records lag violations",
    async () => {
    const queue = new MemoryMessageQueue();
    const worker = runProjectorWorker({ queue, db, shardKeys: ["turns-shard-0"] });
    try {
      const events = [
        ...generateConversationEvents({ conversationId: "cv_worker_a", turnCount: 50 }),
        ...generateConversationEvents({ conversationId: "cv_worker_b", turnCount: 50 }),
      ];
      const interleaved = events
        .filter((_, idx) => idx % 2 === 0)
        .concat(events.filter((_, idx) => idx % 2 === 1));
      for (const event of interleaved) {
        await queue.publish("turns-shard-0", event);
      }
      await waitForTurns(100);

      const firstPass = await db
        .select()
        .from(schema.conversationTurns)
        .where(inArray(schema.conversationTurns.conversationId, ["cv_worker_a", "cv_worker_b"]));
      expect(firstPass).toHaveLength(100);
      const orderedA = firstPass
        .filter((row) => row.conversationId === "cv_worker_a")
        .map((row) => row.ordinal)
        .sort((a, b) => a - b);
      expect(orderedA).toEqual(Array.from({ length: 50 }, (_, i) => (i + 1) * 2 - 1));

      for (const event of interleaved) {
        await queue.publish("turns-shard-0", event);
      }
      await waitForTurns(100);
      const replayPass = await db
        .select()
        .from(schema.conversationTurns)
        .where(inArray(schema.conversationTurns.conversationId, ["cv_worker_a", "cv_worker_b"]));
      expect(replayPass).toHaveLength(100);
      await queue.publish("turns-shard-0", {
        kind: "turn.end",
        conversationId: "cv_worker_a",
        sequenceNumber: 999,
        occurredAt: new Date(Date.now() - 1500),
        payload: { messageId: "stale_1", fullText: "stale", speaker: "assistant" },
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const rows = await db
        .select()
        .from(schema.usageEvents)
        .where(eq(schema.usageEvents.kind, "slo_violation"));
      expect(rows.length).toBeGreaterThanOrEqual(1);
    } finally {
      await worker.stop();
    }
    },
    30_000,
  );
});
