import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
  type TestDb,
  type PoolClient,
} from "@kuralle/core/test-utils";
import {
  recordSloViolation,
  SLO_PROJECTOR_LAG_NAME,
  SLO_PROJECTOR_LAG_THRESHOLD_MS,
} from "./slo.js";

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
  await resetSchema(client, "ws_slo_test");
  await db.insert(schema.agents).values({
    id: "ag_slo_test",
    workspaceId: "ws_slo_test",
    status: "draft",
  });
  await db.insert(schema.agentVersions).values({
    id: "av_slo_test",
    agentId: "ag_slo_test",
    versionNumber: 1,
    versionKind: "publish",
    snapshot: {},
  });
});

describe("recordSloViolation projector lag constants", () => {
  it("writes slo_violation row with projector lag metadata", async () => {
    await recordSloViolation(db, {
      workspaceId: "ws_slo_test",
      agentId: "ag_slo_test",
      agentVersionId: "av_slo_test",
      observedMs: 1500,
      slo: SLO_PROJECTOR_LAG_NAME,
      thresholdMs: SLO_PROJECTOR_LAG_THRESHOLD_MS,
    });

    const rows = await db
      .select()
      .from(schema.usageEvents)
      .where(eq(schema.usageEvents.kind, "slo_violation"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual({
      slo: SLO_PROJECTOR_LAG_NAME,
      observedMs: 1500,
      thresholdMs: SLO_PROJECTOR_LAG_THRESHOLD_MS,
    });
  });
});
