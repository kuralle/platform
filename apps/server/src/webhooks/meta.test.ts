import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { MemoryKvStore } from "@kuralle/platform/memory";
import { createTestDb, releaseTestDb, resetSchema, seedWorkspace } from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import { agents, channelConnections, channelEndpoints } from "@kuralle/db/schema";
import { messagingThreads } from "@kuralle/db/schema";
import { createMetaWebhookApp } from "./meta.js";
import { metaWebhookInbound } from "./meta-fixtures.js";

const WORKSPACE_ID = "org_meta_test";

describe("meta webhook", () => {
  let db: TestDb;
  let client: PoolClient;
  let app: Hono;
  const idCalls: string[] = [];

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    client = t.client;
  });

  beforeEach(async () => {
    idCalls.length = 0;
    await resetSchema(client, WORKSPACE_ID);
    await seedWorkspace(db, { id: WORKSPACE_ID });
    await db.insert(agents).values({ id: "ag_meta_1", workspaceId: WORKSPACE_ID, status: "draft" });
    await db.insert(channelConnections).values({
      id: "ch_meta_1",
      workspaceId: WORKSPACE_ID,
      channelKind: "whatsapp",
      provider: "meta-whatsapp-cloud",
      displayName: "WhatsApp",
      status: "connected",
      config: {},
    });
    await db.insert(channelEndpoints).values({
      id: "ce_meta_1",
      workspaceId: WORKSPACE_ID,
      connectionId: "ch_meta_1",
      channelKind: "whatsapp",
      identifier: "111111",
      attachedAgentId: "ag_meta_1",
    });

    app = new Hono();
    app.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    app.route("/webhooks/meta", createMetaWebhookApp({ kvStore: new MemoryKvStore() }));
  });

  it("GET handshake happy path", async () => {
    const res = await app.request(
      "http://localhost/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc",
      {
        method: "GET",
      },
      {
        META_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "test_secret",
        MESSAGING_DO: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => new Response("OK") }),
        },
      },
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc");
  });

  it("GET handshake wrong verify token returns 403", async () => {
    const res = await app.request(
      "http://localhost/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc",
      { method: "GET" },
      {
        META_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "test_secret",
        MESSAGING_DO: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => new Response("OK") }),
        },
      },
    );
    expect(res.status).toBe(403);
  });

  it("POST valid signature routes to DO", async () => {
    const inbound = metaWebhookInbound({ appSecret: "test_secret", phoneNumberId: "111111" });
    const res = await app.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: inbound.rawBody,
        headers: { "X-Hub-Signature-256": inbound.signature, "content-type": "application/json" },
      },
      {
        META_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "test_secret",
        MESSAGING_DO: {
          idFromName: (name: string) => {
            idCalls.push(name);
            return name;
          },
          get: () => ({ fetch: async () => new Response("OK") }),
        },
      },
    );
    expect(res.status).toBe(200);
    expect(idCalls[0]).toBe("whatsapp:94770000000");
    const rows = await db.select().from(messagingThreads);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.threadKey).toBe("whatsapp:94770000000");
  });

  it("routes same wa_id to the same durable object id", async () => {
    const inbound = metaWebhookInbound({ appSecret: "test_secret", waId: "94771112222" });
    const env = {
      META_VERIFY_TOKEN: "verify",
      META_APP_SECRET: "test_secret",
      MESSAGING_DO: {
        idFromName: (name: string) => {
          idCalls.push(name);
          return name;
        },
        get: () => ({ fetch: async () => new Response("OK") }),
      },
    };

    await app.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: inbound.rawBody,
        headers: { "X-Hub-Signature-256": inbound.signature, "content-type": "application/json" },
      },
      env,
    );
    await app.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: inbound.rawBody,
        headers: { "X-Hub-Signature-256": inbound.signature, "content-type": "application/json" },
      },
      env,
    );

    expect(idCalls).toHaveLength(2);
    expect(idCalls[0]).toBe(idCalls[1]);
  });

  it("POST invalid signature returns 401", async () => {
    const inbound = metaWebhookInbound({ appSecret: "test_secret", phoneNumberId: "111111" });
    const res = await app.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: inbound.rawBody,
        headers: { "X-Hub-Signature-256": "sha256=bad", "content-type": "application/json" },
      },
      {
        META_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "test_secret",
        MESSAGING_DO: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => new Response("OK") }),
        },
      },
    );
    expect(res.status).toBe(401);
  });

  it("POST missing signature returns 401", async () => {
    const inbound = metaWebhookInbound({ appSecret: "test_secret", phoneNumberId: "111111" });
    const res = await app.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: inbound.rawBody,
        headers: { "content-type": "application/json" },
      },
      {
        META_VERIFY_TOKEN: "verify",
        META_APP_SECRET: "test_secret",
        MESSAGING_DO: {
          idFromName: (name: string) => name,
          get: () => ({ fetch: async () => new Response("OK") }),
        },
      },
    );
    expect(res.status).toBe(401);
  });

  afterAll(async () => {
    await releaseTestDb(client);
  });
});

