import { and, eq, desc } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { WorkspaceScopeViolation } from "../errors.js";

export interface Conversation {
  id: string;
  workspaceId: string;
  agentId: string | null;
  agentVersionId: string | null;
  bundleHash: string | null;
  channelKind: string;
  channelEndpointId: string | null;
  threadKey: string;
  direction: string | null;
  participantId: string | null;
  participantName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  outcome: string | null;
  recordingStorageKey: string | null;
  costUsd: number | null;
  evalsPassed: number;
  evalsTotal: number;
  topics: string[];
  metadata: unknown;
  deploymentId: string | null;
  turnsArchiveKey: string | null;
  guardrailEventsArchiveKey: string | null;
}

export interface ConversationInsert {
  id: string;
  agentId?: string;
  agentVersionId?: string;
  bundleHash?: string;
  channelKind: string;
  channelEndpointId?: string;
  threadKey: string;
  direction?: string;
  participantId?: string;
  participantName?: string;
  startedAt?: Date;
}

export interface ConversationUpdate {
  endedAt?: Date;
  durationSec?: number;
  outcome?: string;
  recordingStorageKey?: string;
  costUsd?: number;
  evalsPassed?: number;
  evalsTotal?: number;
  topics?: string[];
  metadata?: unknown;
  agentVersionId?: string;
}

function toDomain(
  row: typeof schema.conversations.$inferSelect,
): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    agentVersionId: row.agentVersionId,
    bundleHash: row.bundleHash,
    channelKind: row.channelKind,
    channelEndpointId: row.channelEndpointId,
    threadKey: row.threadKey,
    direction: row.direction,
    participantId: row.participantId,
    participantName: row.participantName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSec: row.durationSec,
    outcome: row.outcome,
    recordingStorageKey: row.recordingStorageKey,
    costUsd: row.costUsd,
    evalsPassed: row.evalsPassed ?? 0,
    evalsTotal: row.evalsTotal ?? 0,
    topics: row.topics ?? [],
    metadata: row.metadata,
    deploymentId: row.deploymentId,
    turnsArchiveKey: row.turnsArchiveKey,
    guardrailEventsArchiveKey: row.guardrailEventsArchiveKey,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:conversation:${workspaceId}:${id}`;
}

export class ConversationRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<Conversation | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.id, id),
            eq(schema.conversations.workspaceId, this.workspaceId),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("conversation", row.id, this.workspaceId, row.workspaceId);
      }
      return toDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Conversation[]> {
    const limit = opts?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.workspaceId, this.workspaceId))
      .orderBy(desc(schema.conversations.startedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async insert(input: ConversationInsert): Promise<Conversation> {
    const [row] = await this.db
      .insert(schema.conversations)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        agentId: input.agentId ?? null,
        agentVersionId: input.agentVersionId ?? null,
        bundleHash: input.bundleHash ?? null,
        channelKind: input.channelKind,
        channelEndpointId: input.channelEndpointId ?? null,
        threadKey: input.threadKey,
        direction: input.direction ?? null,
        participantId: input.participantId ?? null,
        participantName: input.participantName ?? null,
        startedAt: input.startedAt ?? new Date(),
      })
      .returning();

    if (!row) throw new Error("ConversationRepository.insert: no row returned");
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  async update(id: string, patch: ConversationUpdate): Promise<Conversation> {
    const [row] = await this.db
      .update(schema.conversations)
      .set(patch)
      .where(
        and(
          eq(schema.conversations.id, id),
          eq(schema.conversations.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("ConversationRepository.update: no row returned");

    await this.kv.delete(cacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  // No softDelete — conversations table has no deletedAt column per DATA_MODEL.md
}
