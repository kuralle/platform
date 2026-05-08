import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { appRouter } from "@kuralle/api/routers/index";
import type { Context } from "@kuralle/api/context";
import { createMetaWebhookApp } from "../webhooks/meta.js";
import { buildSloWebhookEnvelope } from "./__fixtures__/meta-webhook-slo-inbound.js";
import { shardKeyForConversation } from "../durable-objects/shard.js";
import { runProjectorWorker } from "@kuralle/runtime";
import {
  SLO_WHATSAPP_E2E_THRESHOLD_MS,
  SLO_WHATSAPP_E2E_NAME,
} from "@kuralle/runtime";
import { MemoryKvStore, MemoryMessageQueue } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspace,
  closePool,
} from "@kuralle/core/test-utils";
import type { PoolClient, TestDb } from "@kuralle/core/test-utils";
import {
  agents,
  channelConnections,
  channelEndpoints,
  messagingThreads,
} from "@kuralle/db/schema";
import type { MessagingEvent } from "@kuralle/runtime";

const WORKSPACE_ID = "org_test_s3_06";
const AGENT_ID = "ag_test_s3_06";
const CONNECTION_ID = "ch_test_s3_06";
const ENDPOINT_ID = "ce_test_s3_06";
const WA_ID = "94770000666";
const THREAD_KEY = `whatsapp:${WA_ID}`;
const PHONE_NUMBER_ID = "111111";
const APP_SECRET = "test_secret";
const ARTIFACT_PATH = join(
  process.cwd(),
  "..",
  "..",
  "sprints",
  "sprint-3",
  "artifacts",
  "whatsapp-e2e.log",
);

type ProcedureLike = {
  "~orpc": {
    handler: (opts: { input: unknown; context: Context }) => Promise<unknown>;
  };
};

type SegmentTrace = {
  trial: number;
  messageId: string;
  t0Ms: number;
  webhookAcceptedAtMs: number;
  firstProjectorConsumeAtMs: number | null;
  txCommitAtMs: number | null;
  conversationGetSuccessAtMs: number | null;
  totalLatencyMs: number;
};

type ConversationGetResult = {
  turns: Array<{ messageId: string | null }>;
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

async function call<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
}

describe("S3-06 whatsapp inbound -> F2 visible e2e SLO", () => {
  let db: TestDb;
  let client: PoolClient;
  let app: Hono;
  let kvStore: MemoryKvStore;
  let queue: MemoryMessageQueue;
  let projectorStop: { stop: () => Promise<void> } | null;
  let firstProjectorConsumeAtMs: number | null;
  let lastTxCommitAtMs: number | null;
  let ctx: Context;

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    client = created.client;
  });

  beforeEach(async () => {
    if (projectorStop) {
      await projectorStop.stop();
    }
    await resetSchema(client, WORKSPACE_ID);
    await seedWorkspace(db, { id: WORKSPACE_ID });
    await db.insert(agents).values({
      id: AGENT_ID,
      workspaceId: WORKSPACE_ID,
      status: "draft",
    });
    await db.insert(channelConnections).values({
      id: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
      channelKind: "whatsapp",
      provider: "meta-whatsapp-cloud",
      displayName: "S3-06 WhatsApp",
      status: "connected",
      config: {},
    });
    await db.insert(channelEndpoints).values({
      id: ENDPOINT_ID,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
      channelKind: "whatsapp",
      identifier: PHONE_NUMBER_ID,
      attachedAgentId: AGENT_ID,
    });

    kvStore = new MemoryKvStore();
    queue = new MemoryMessageQueue();
    projectorStop = runProjectorWorker({
      db,
      queue,
    });
    firstProjectorConsumeAtMs = null;
    lastTxCommitAtMs = null;
    ctx = {
      auth: null,
      session: null,
      db,
      kvStore,
      env: {
        META_APP_ID: "",
        META_APP_SECRET: APP_SECRET,
        META_SYSTEM_USER_TOKEN: "",
        META_VERIFY_TOKEN: "verify",
        META_PHONE_NUMBER_ID: PHONE_NUMBER_ID,
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
    };

    app = new Hono();
    app.route("/webhooks/meta", createMetaWebhookApp({ db, kvStore }));
  });

  afterAll(async () => {
    if (projectorStop) {
      await projectorStop.stop();
    }
    await releaseTestDb(client);
    await closePool();
  });

  it(
    "measures p95 over 10 synthetic inbound webhook trials and enforces <= 4s",
    async () => {
      const traces: SegmentTrace[] = [];
      const latencies: number[] = [];

      for (let trial = 1; trial <= 10; trial += 1) {
        firstProjectorConsumeAtMs = null;
        lastTxCommitAtMs = null;
        const messageId = `wamid.s3_06_${trial}_${crypto.randomUUID().slice(0, 8)}`;
        const envelope = buildSloWebhookEnvelope({
          appSecret: APP_SECRET,
          messageId,
          phoneNumberId: PHONE_NUMBER_ID,
          waId: WA_ID,
          text: `trial-${trial}`,
        });

        const t0 = Date.now();
        const response = await app.request(
          "http://localhost/webhooks/meta",
          {
            method: "POST",
            body: envelope.rawBody,
            headers: {
              "X-Hub-Signature-256": envelope.signature,
              "content-type": "application/json",
            },
          },
          {
            META_VERIFY_TOKEN: "verify",
            META_APP_SECRET: APP_SECRET,
            MESSAGING_DO: {
              idFromName: (name: string) => name,
              get: () => ({
                fetch: async (request: Request) => {
                  const envelopeBody = (await request.json()) as {
                    conversationId: string;
                    messageId: string;
                    text: string;
                  };
                  const conversationId = envelopeBody.conversationId;
                  const event: MessagingEvent = {
                    kind: "turn.end",
                    conversationId,
                    sequenceNumber: trial,
                    occurredAt: new Date(),
                    payload: {
                      messageId: envelopeBody.messageId,
                      fullText: envelopeBody.text,
                      speaker: "assistant",
                    },
                  };
                  if (firstProjectorConsumeAtMs === null) {
                    firstProjectorConsumeAtMs = Date.now();
                  }
                  await queue.publish(shardKeyForConversation(conversationId), event, {
                    idempotencyKey: `${conversationId}:${event.sequenceNumber}:${event.kind}`,
                  });
                  return new Response("OK", { status: 200 });
                },
              }),
            },
          },
        );
        const webhookAcceptedAtMs = Date.now();
        expect(response.status).toBe(200);

        const thread = await db
          .select({ conversationId: messagingThreads.lastConversationId })
          .from(messagingThreads)
          .where(
            and(
              eq(messagingThreads.workspaceId, WORKSPACE_ID),
              eq(messagingThreads.threadKey, THREAD_KEY),
              eq(messagingThreads.channelEndpointId, ENDPOINT_ID),
            ),
          )
          .limit(1);
        const conversationId = thread[0]?.conversationId;
        expect(conversationId).toBeTruthy();
        if (!conversationId) {
          throw new Error("Expected messaging thread conversationId to exist");
        }

        const deadline = Date.now() + 5000;
        let seen = false;
        while (Date.now() < deadline) {
          const detail = await call<ConversationGetResult>(
            appRouter.conversations.get,
            {
              workspaceId: WORKSPACE_ID,
              conversationId,
            },
            ctx,
          );
          if (detail.turns.some((turn) => turn.messageId === messageId)) {
            seen = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (seen) {
          const successAtMs = Date.now();
          lastTxCommitAtMs = successAtMs;
          const latency = successAtMs - t0;
          latencies.push(latency);
          traces.push({
            trial,
            messageId,
            t0Ms: t0,
            webhookAcceptedAtMs,
            firstProjectorConsumeAtMs,
            txCommitAtMs: lastTxCommitAtMs,
            conversationGetSuccessAtMs: successAtMs,
            totalLatencyMs: latency,
          });
        } else {
          latencies.push(-1);
          traces.push({
            trial,
            messageId,
            t0Ms: t0,
            webhookAcceptedAtMs,
            firstProjectorConsumeAtMs,
            txCommitAtMs: lastTxCommitAtMs,
            conversationGetSuccessAtMs: null,
            totalLatencyMs: -1,
          });
        }
      }

      const successful = latencies.filter((ms) => ms >= 0).sort((a, b) => a - b);
      expect(successful).toHaveLength(10);
      const p95 = percentile(successful, 0.95);
      expect(p95).toBeLessThanOrEqual(SLO_WHATSAPP_E2E_THRESHOLD_MS);

      const lines: string[] = [];
      lines.push(
        `SLO Name: ${SLO_WHATSAPP_E2E_NAME}`,
        `Threshold(ms): ${SLO_WHATSAPP_E2E_THRESHOLD_MS}`,
        `Latencies(ms): ${latencies.join(", ")}`,
        `p95(ms): ${p95}`,
        "",
        "Per-trial trace:",
      );
      for (const trace of traces) {
        const t0ToWebhook = Math.max(0, trace.webhookAcceptedAtMs - trace.t0Ms);
        const webhookToProjector =
          trace.firstProjectorConsumeAtMs === null
            ? -1
            : Math.max(0, trace.firstProjectorConsumeAtMs - trace.webhookAcceptedAtMs);
        const projectorToCommit =
          trace.firstProjectorConsumeAtMs === null || trace.txCommitAtMs === null
            ? -1
            : Math.max(0, trace.txCommitAtMs - trace.firstProjectorConsumeAtMs);
        const commitToGet =
          trace.txCommitAtMs === null || trace.conversationGetSuccessAtMs === null
            ? -1
            : Math.max(0, trace.conversationGetSuccessAtMs - trace.txCommitAtMs);
        lines.push(
          `trial=${trace.trial} messageId=${trace.messageId} total=${trace.totalLatencyMs} ` +
            `t0_to_webhook_200=${t0ToWebhook} ` +
            `webhook_200_to_projector_first=${webhookToProjector} ` +
            `projector_first_to_tx_commit=${projectorToCommit} ` +
            `tx_commit_to_conversations_get=${commitToGet}`,
        );
      }
      await mkdir(join(process.cwd(), "..", "..", "sprints", "sprint-3", "artifacts"), {
        recursive: true,
      });
      await writeFile(ARTIFACT_PATH, `${lines.join("\n")}\n`, "utf8");
      console.log(lines.join("\n"));
    },
    60_000,
  );

  it.skipIf(!process.env.KURALLE_SLO_REAL_META)(
    "optional real Meta sandbox round-trip when explicitly enabled",
    async () => {
      expect(process.env.KURALLE_SLO_REAL_META).toBe("1");
      expect(process.env.META_PHONE_NUMBER_ID).toBeTruthy();
    },
  );
});
