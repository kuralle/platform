import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspace,
  closePool,
  type PoolClient,
  type TestDb,
} from "@kuralle/core/test-utils";
import type { MessagingEvent } from "../adapter/events.js";
import { projectConversationEvent } from "./conversation.js";

let db: TestDb;
let client: PoolClient;

const ctx = { workspaceId: "ws_proj", agentId: "ag_proj", channelEndpointId: "ce_proj" };

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
  await resetSchema(client, ctx.workspaceId);
  await seedWorkspace(db, { id: ctx.workspaceId });
  await db.insert(schema.agents).values({ id: ctx.agentId, workspaceId: ctx.workspaceId, status: "draft" });
  await db.insert(schema.channelConnections).values({
    id: "cc_proj",
    workspaceId: ctx.workspaceId,
    channelKind: "whatsapp",
    provider: "meta-whatsapp-cloud",
    displayName: "WhatsApp",
    status: "connected",
    config: {},
  });
  await db.insert(schema.channelEndpoints).values({
    id: ctx.channelEndpointId,
    workspaceId: ctx.workspaceId,
    connectionId: "cc_proj",
    channelKind: "whatsapp",
    identifier: "phone_1",
    attachedAgentId: ctx.agentId,
  });
  await db.insert(schema.conversations).values({
    id: "cv_proj",
    workspaceId: ctx.workspaceId,
    channelKind: "whatsapp",
    channelEndpointId: ctx.channelEndpointId,
    threadKey: "whatsapp:+10000000",
  });
});

describe("projectConversationEvent", () => {
  it("inserts turn.end and deduplicates replay by conversationId+messageId", async () => {
    const event: MessagingEvent = {
      kind: "turn.end",
      conversationId: "cv_proj",
      sequenceNumber: 1,
      occurredAt: new Date("2026-05-08T10:00:00.000Z"),
      payload: { messageId: "mid_1", fullText: "hello", speaker: "assistant" },
    };
    await db.transaction((tx) => projectConversationEvent(tx, event, ctx));
    await db.transaction((tx) => projectConversationEvent(tx, event, ctx));

    const rows = await db
      .select()
      .from(schema.conversationTurns)
      .where(
        and(
          eq(schema.conversationTurns.conversationId, "cv_proj"),
          eq(schema.conversationTurns.messageId, "mid_1"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("writes tool.call row", async () => {
    await db.insert(schema.conversationTurns).values({
      id: "turn_seed",
      conversationId: "cv_proj",
      ordinal: 1,
      text: "seed",
      speaker: "agent",
      timestampSec: 1,
    });
    const event: MessagingEvent = {
      kind: "tool.call",
      conversationId: "cv_proj",
      sequenceNumber: 1,
      occurredAt: new Date("2026-05-08T10:00:00.000Z"),
      payload: { toolCallId: "tc_1", toolName: "lookup", args: { a: 1 } },
    };
    await db.transaction((tx) => projectConversationEvent(tx, event, ctx));
    const rows = await db.select().from(schema.conversationToolCalls);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.toolName).toBe("lookup");
  });

  it("writes extraction fields from tool.result transition", async () => {
    await db.insert(schema.conversationTurns).values({
      id: "turn_seed2",
      conversationId: "cv_proj",
      ordinal: 1,
      text: "seed",
      speaker: "agent",
      timestampSec: 1,
    });
    const event: MessagingEvent = {
      kind: "tool.result",
      conversationId: "cv_proj",
      sequenceNumber: 1,
      occurredAt: new Date("2026-05-08T10:00:00.000Z"),
      payload: {
        toolCallId: "tc_2",
        toolName: "continue",
        success: true,
        durationMs: 10,
        extraction: { targetNode: "node", data: { customerName: "Sarah" } },
      },
    };
    await db.transaction((tx) => projectConversationEvent(tx, event, ctx));
    const rows = await db.select().from(schema.conversationExtractedFields);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("customerName");
  });

  it("writes usage_events rows for tokens.updated", async () => {
    const event: MessagingEvent = {
      kind: "tokens.updated",
      conversationId: "cv_proj",
      sequenceNumber: 1,
      occurredAt: new Date("2026-05-08T10:00:00.000Z"),
      payload: {
        turn: 1,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        latencyMs: 10,
        cumulativeInputTokens: 100,
        cumulativeOutputTokens: 20,
        cumulativeTotalTokens: 120,
      },
    };
    await db.transaction((tx) => projectConversationEvent(tx, event, ctx));
    const rows = await db.select().from(schema.usageEvents);
    expect(rows).toHaveLength(2);
  });
});
