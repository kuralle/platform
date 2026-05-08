/**
 * Integration test: channels.connect → endpoints.list → attach → detach round-trip.
 *
 * Wires local Postgres + memory KvStore via the core test-utils pattern.
 * Mocks `@kuralle/runtime`'s Meta-Graph helpers so the router never hits real Meta.
 *
 * Also exercises the polymorphic CHECK trigger from migration `0008_s1_03_meta.sql`
 * (renamed in `0013_s3_01_meta.sql`): inserting a `channel_endpoints` row whose
 * `channel_kind` does not match the parent `channel_connections.channel_kind`
 * must raise a Postgres exception.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";

vi.mock("@kuralle/runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kuralle/runtime")>();
  return {
    ...original,
    createMetaWhatsAppClient: vi.fn(() => ({ graphApi: {} })),
    listPhoneNumbers: vi.fn(),
    subscribeApp: vi.fn(),
    unsubscribeApp: vi.fn(),
  };
});

import {
  listPhoneNumbers,
  subscribeApp,
  unsubscribeApp,
} from "@kuralle/runtime";
import { appRouter } from "@kuralle/api/routers/index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
} from "@kuralle/core/test-utils";
import type { PoolClient, TestDb } from "@kuralle/core/test-utils";
import type { Context } from "@kuralle/api/context";
import {
  channelConnections,
  channelEndpoints,
  secrets,
  agents,
} from "@kuralle/db/schema";
import { eq } from "drizzle-orm";

const WORKSPACE_ID = "org_test_s3_01";
const AGENT_ID = "ag_test_s3_01_fixture";

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
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
}

interface ConnectResult {
  connectionId: string;
  availablePhoneNumbers: Array<{
    phoneNumberId: string;
    displayPhoneNumber: string;
    qualityRating?: string;
  }>;
}

interface AttachResult {
  endpointId: string;
}

interface DetachResult {
  released: boolean;
  alreadyReleased?: boolean;
}

describe("channels router round-trip", () => {
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
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    kvStore = new MemoryKvStore();
    await resetSchema(client, WORKSPACE_ID);
    // Endpoints require an agent (per DATA_MODEL.md §8:626 attachment CHECK).
    await db.insert(agents).values({
      id: AGENT_ID,
      workspaceId: WORKSPACE_ID,
      status: "draft",
    });
    ctx = {
      auth: null,
      session: null,
      db,
      kvStore,
      env: {
        META_APP_ID: "test_app",
        META_APP_SECRET: "test_secret",
        META_SYSTEM_USER_TOKEN: "test_token",
        META_VERIFY_TOKEN: "test_verify",
        META_PHONE_NUMBER_ID: "111111",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
      requestHeaders: new Headers(),
    };
  });

  it("connect inserts secret + connection rows and returns available numbers", async () => {
    vi.mocked(listPhoneNumbers).mockResolvedValueOnce([
      {
        id: "123456",
        displayPhoneNumber: "+15551234567",
        qualityRating: "GREEN",
      },
    ]);

    const result = await call<ConnectResult>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp Sandbox",
      },
      ctx,
    );

    expect(result.connectionId).toMatch(/^chc_/);
    expect(result.availablePhoneNumbers).toEqual([
      {
        phoneNumberId: "123456",
        displayPhoneNumber: "+15551234567",
        qualityRating: "GREEN",
      },
    ]);

    const conns = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, result.connectionId));
    expect(conns).toHaveLength(1);
    expect(conns[0]?.channelKind).toBe("whatsapp");
    expect(conns[0]?.provider).toBe("meta-whatsapp-cloud");

    expect(conns[0]?.credentialsSecretId).toBeTruthy();
    const secretRows = await db
      .select()
      .from(secrets)
      .where(eq(secrets.id, conns[0]!.credentialsSecretId!));
    expect(secretRows).toHaveLength(1);
    expect(secretRows[0]?.name).toBe("meta_credentials");
  });

  it("attach inserts endpoint and calls subscribeApp with the right webhook URL", async () => {
    vi.mocked(listPhoneNumbers).mockResolvedValueOnce([
      { id: "123456", displayPhoneNumber: "+15551234567" },
    ]);

    const connectResult = await call<ConnectResult>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp",
      },
      ctx,
    );

    const attachResult = await call<AttachResult>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId: connectResult.connectionId,
        phoneNumberId: "123456",
        agentId: AGENT_ID,
      },
      ctx,
    );

    expect(attachResult.endpointId).toMatch(/^che_/);
    expect(vi.mocked(subscribeApp)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(subscribeApp).mock.calls[0]?.[1]).toEqual({
      phoneNumberId: "123456",
    });

    const endpoints = await db
      .select()
      .from(channelEndpoints)
      .where(eq(channelEndpoints.id, attachResult.endpointId));
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]?.channelKind).toBe("whatsapp");
    expect(endpoints[0]?.identifier).toBe("123456");
    expect(endpoints[0]?.publicWebhookUrl).toBe(
      "http://localhost:3000/webhooks/meta",
    );
    expect(endpoints[0]?.releasedAt).toBeNull();
  });

  it("detach soft-deletes endpoint, calls unsubscribeApp, and is idempotent", async () => {
    vi.mocked(listPhoneNumbers).mockResolvedValueOnce([
      { id: "123456", displayPhoneNumber: "+15551234567" },
    ]);

    const connectResult = await call<ConnectResult>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp",
      },
      ctx,
    );
    const attachResult = await call<AttachResult>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId: connectResult.connectionId,
        phoneNumberId: "123456",
        agentId: AGENT_ID,
      },
      ctx,
    );

    const detach1 = await call<DetachResult>(
      appRouter.channels.endpoints.detach,
      { workspaceId: WORKSPACE_ID, endpointId: attachResult.endpointId },
      ctx,
    );
    expect(detach1.released).toBe(true);
    expect(detach1.alreadyReleased).toBeUndefined();
    expect(vi.mocked(unsubscribeApp)).toHaveBeenCalledTimes(1);

    const endpoints = await db
      .select()
      .from(channelEndpoints)
      .where(eq(channelEndpoints.id, attachResult.endpointId));
    expect(endpoints[0]?.releasedAt).not.toBeNull();

    // Second detach is idempotent — releasedAt was set, so unsubscribeApp
    // should NOT be called again, and the result flips alreadyReleased.
    const detach2 = await call<DetachResult>(
      appRouter.channels.endpoints.detach,
      { workspaceId: WORKSPACE_ID, endpointId: attachResult.endpointId },
      ctx,
    );
    expect(detach2.released).toBe(true);
    expect(detach2.alreadyReleased).toBe(true);
    expect(vi.mocked(unsubscribeApp)).toHaveBeenCalledTimes(1);
  });

  it("polymorphic CHECK trigger rejects mismatched channel_kind on endpoint insert", async () => {
    vi.mocked(listPhoneNumbers).mockResolvedValueOnce([]);

    const connectResult = await call<ConnectResult>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp",
      },
      ctx,
    );

    // The connection is whatsapp-kind. Inserting an endpoint of kind 'telephony'
    // attached to it must raise a check_violation per
    // `0013_s3_01_meta.sql` / `0008_s1_03_meta.sql`.
    await expect(
      db.insert(channelEndpoints).values({
        id: "che_kind_violation",
        workspaceId: WORKSPACE_ID,
        connectionId: connectResult.connectionId,
        channelKind: "telephony",
        identifier: "+15550000000",
      }),
    ).rejects.toThrow(/channel_kind/);
  });

  it("endpoints.listByKind returns endpoints filtered by kind", async () => {
    vi.mocked(listPhoneNumbers).mockResolvedValueOnce([
      { id: "123", displayPhoneNumber: "+15551234567" },
    ]);

    const connectResult = await call<ConnectResult>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp",
      },
      ctx,
    );
    await call<AttachResult>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId: connectResult.connectionId,
        phoneNumberId: "123",
        agentId: AGENT_ID,
      },
      ctx,
    );

    const whatsapp = await call<{ items: Array<{ channelKind: string }> }>(
      appRouter.channels.endpoints.listByKind,
      { workspaceId: WORKSPACE_ID, kind: "whatsapp" },
      ctx,
    );
    expect(whatsapp.items).toHaveLength(1);
    expect(whatsapp.items[0]?.channelKind).toBe("whatsapp");

    const telephony = await call<{ items: unknown[] }>(
      appRouter.channels.endpoints.listByKind,
      { workspaceId: WORKSPACE_ID, kind: "telephony" },
      ctx,
    );
    expect(telephony.items).toHaveLength(0);
  });
});
