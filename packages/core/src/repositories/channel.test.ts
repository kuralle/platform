import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { ChannelRepository } from "./channel.js";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";

const kvStore = new MemoryKvStore();
const workspaceId = "ws_test_s2_01";

let client: PoolClient;
let db: TestDb;
let repo: ChannelRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new ChannelRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("ChannelRepository", () => {
  describe("findById", () => {
    it("returns null for missing channel", async () => {
      expect(await repo.findById("ch_nonexistent")).toBeNull();
    });

    it("returns the inserted channel", async () => {
      await repo.insert({
        id: "ch_test_1",
        channelKind: "voice",
        provider: "twilio-native",
        displayName: "Test Voice",
      });
      const found = await repo.findById("ch_test_1");
      expect(found).not.toBeNull();
      expect(found!.displayName).toBe("Test Voice");
      expect(found!.workspaceId).toBe(workspaceId);
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns channels scoped to workspace", async () => {
      await repo.insert({ id: "ch_list_1", channelKind: "voice", provider: "twilio", displayName: "A" });
      await repo.insert({ id: "ch_list_2", channelKind: "whatsapp", provider: "twilio", displayName: "B" });
      const channels = await repo.findManyByWorkspace();
      expect(channels).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default status connected", async () => {
      const channel = await repo.insert({
        id: "ch_defaults",
        channelKind: "voice",
        provider: "twilio-native",
        displayName: "Defaults",
      });
      expect(channel.status).toBe("connected");
    });
  });

  describe("update", () => {
    it("updates channel fields and invalidates cache", async () => {
      await repo.insert({ id: "ch_update", channelKind: "voice", provider: "twilio", displayName: "Old" });
      const updated = await repo.update("ch_update", {
        displayName: "Updated",
        status: "connected",
      });
      expect(updated.displayName).toBe("Updated");
      expect(updated.status).toBe("connected");

      const found = await repo.findById("ch_update");
      expect(found!.displayName).toBe("Updated");
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and invalidates cache", async () => {
      await repo.insert({ id: "ch_to_delete", channelKind: "voice", provider: "twilio", displayName: "Del" });
      expect(await repo.findById("ch_to_delete")).not.toBeNull();

      await repo.softDelete("ch_to_delete");
      expect(await repo.findById("ch_to_delete")).toBeNull();
    });
  });

  // ── Endpoint-level CRUD (S3-01 fix-pass) ──────────────────────────
  describe("endpoint methods", () => {
    async function seedAgent(agentId: string): Promise<void> {
      const { agents } = await import("@kuralle/db/schema");
      await db.insert(agents).values({
        id: agentId,
        workspaceId,
        status: "draft",
      });
    }

    async function seedConnection(id: string, kind: string): Promise<void> {
      await repo.insert({
        id,
        channelKind: kind,
        provider: "test-provider",
        displayName: `${kind} parent`,
      });
    }

    describe("findEndpointById", () => {
      it("cache miss → DB read → cache hit on second call", async () => {
        await seedAgent("ag_e1");
        await seedConnection("chc_e1", "whatsapp");
        await repo.insertEndpoint({
          id: "che_e1",
          connectionId: "chc_e1",
          channelKind: "whatsapp",
          identifier: "111",
          attachedAgentId: "ag_e1",
        });

        const first = await repo.findEndpointById("che_e1");
        expect(first?.identifier).toBe("111");
        const cached = await kvStore.get(
          `repo:channel_endpoint:${workspaceId}:che_e1`,
        );
        expect(cached).not.toBeNull();

        const second = await repo.findEndpointById("che_e1");
        expect(second?.id).toBe("che_e1");
      });

      it("returns null after softDeleteEndpoint", async () => {
        await seedAgent("ag_e2");
        await seedConnection("chc_e2", "whatsapp");
        await repo.insertEndpoint({
          id: "che_e2",
          connectionId: "chc_e2",
          channelKind: "whatsapp",
          identifier: "222",
          attachedAgentId: "ag_e2",
        });

        await repo.softDeleteEndpoint("che_e2");
        expect(await repo.findEndpointById("che_e2")).toBeNull();
      });
    });

    describe("findEndpointsByConnection", () => {
      it("returns endpoints scoped to a single connection", async () => {
        await seedAgent("ag_eb");
        await seedConnection("chc_a", "whatsapp");
        await seedConnection("chc_b", "whatsapp");
        await repo.insertEndpoint({
          id: "che_a1",
          connectionId: "chc_a",
          channelKind: "whatsapp",
          identifier: "a1",
          attachedAgentId: "ag_eb",
        });
        await repo.insertEndpoint({
          id: "che_b1",
          connectionId: "chc_b",
          channelKind: "whatsapp",
          identifier: "b1",
          attachedAgentId: "ag_eb",
        });

        const a = await repo.findEndpointsByConnection("chc_a");
        expect(a.map((e) => e.id)).toEqual(["che_a1"]);
      });
    });

    describe("findEndpointsByKind", () => {
      it("filters by channel_kind across connections", async () => {
        await seedAgent("ag_ek");
        await seedConnection("chc_w", "whatsapp");
        await seedConnection("chc_v", "voice");
        await repo.insertEndpoint({
          id: "che_w",
          connectionId: "chc_w",
          channelKind: "whatsapp",
          identifier: "w",
          attachedAgentId: "ag_ek",
        });
        await repo.insertEndpoint({
          id: "che_v",
          connectionId: "chc_v",
          channelKind: "voice",
          identifier: "+15550000",
          attachedAgentId: "ag_ek",
        });

        const w = await repo.findEndpointsByKind("whatsapp");
        expect(w.map((e) => e.id)).toEqual(["che_w"]);
        const v = await repo.findEndpointsByKind("voice");
        expect(v.map((e) => e.id)).toEqual(["che_v"]);
      });
    });

    describe("connectWithCredentials", () => {
      it("inserts secrets + channel_connections atomically", async () => {
        const conn = await repo.connectWithCredentials({
          connectionId: "chc_cwc",
          displayName: "Cred Conn",
          provider: "meta-whatsapp-cloud",
          channelKind: "whatsapp",
          capabilities: ["messaging"],
          credentials: {
            secretId: "sec_cwc",
            name: "meta_credentials",
            ciphertext: Buffer.from("encrypted"),
            kmsKeyId: "none",
            scope: "workspace",
          },
        });

        expect(conn.id).toBe("chc_cwc");
        expect(conn.credentialsSecretId).toBe("sec_cwc");
        const found = await repo.findById("chc_cwc");
        expect(found?.id).toBe("chc_cwc");
      });
    });

    describe("attachEndpoint", () => {
      it("inserts endpoint and runs onAttached callback inside tx", async () => {
        await seedAgent("ag_atta");
        await seedConnection("chc_att", "whatsapp");
        let callbackCalled = false;
        const result = await repo.attachEndpoint({
          endpoint: {
            id: "che_att",
            connectionId: "chc_att",
            channelKind: "whatsapp",
            identifier: "att1",
            attachedAgentId: "ag_atta",
          },
          onAttached: async () => {
            callbackCalled = true;
          },
        });
        expect(result.id).toBe("che_att");
        expect(callbackCalled).toBe(true);
      });

      it("rolls back when onAttached throws", async () => {
        await seedAgent("ag_attb");
        await seedConnection("chc_atb", "whatsapp");
        await expect(
          repo.attachEndpoint({
            endpoint: {
              id: "che_atb",
              connectionId: "chc_atb",
              channelKind: "whatsapp",
              identifier: "atb1",
              attachedAgentId: "ag_attb",
            },
            onAttached: async () => {
              throw new Error("provider error");
            },
          }),
        ).rejects.toThrow(/provider error/);

        expect(await repo.findEndpointById("che_atb")).toBeNull();
      });
    });

    describe("detachEndpoint", () => {
      it("returns released, runs onDetached, soft-deletes the row", async () => {
        await seedAgent("ag_det");
        await seedConnection("chc_det", "whatsapp");
        await repo.insertEndpoint({
          id: "che_det",
          connectionId: "chc_det",
          channelKind: "whatsapp",
          identifier: "d1",
          attachedAgentId: "ag_det",
        });

        let identifier = "";
        const r = await repo.detachEndpoint({
          endpointId: "che_det",
          onDetached: async (_tx, endpoint) => {
            identifier = endpoint.identifier;
          },
        });
        expect(r.status).toBe("released");
        expect(identifier).toBe("d1");
        expect(await repo.findEndpointById("che_det")).toBeNull();
      });

      it("returns already_released on second detach without re-firing callback", async () => {
        await seedAgent("ag_det2");
        await seedConnection("chc_det2", "whatsapp");
        await repo.insertEndpoint({
          id: "che_det2",
          connectionId: "chc_det2",
          channelKind: "whatsapp",
          identifier: "d2",
          attachedAgentId: "ag_det2",
        });

        let calls = 0;
        await repo.detachEndpoint({
          endpointId: "che_det2",
          onDetached: async () => {
            calls += 1;
          },
        });
        const r2 = await repo.detachEndpoint({
          endpointId: "che_det2",
          onDetached: async () => {
            calls += 1;
          },
        });
        expect(r2.status).toBe("already_released");
        expect(calls).toBe(1);
      });

      it("returns not_found for unknown endpointId", async () => {
        const r = await repo.detachEndpoint({
          endpointId: "che_does_not_exist",
          onDetached: async () => {},
        });
        expect(r.status).toBe("not_found");
      });
    });
  });
});
