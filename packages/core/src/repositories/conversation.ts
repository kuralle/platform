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

export interface MessagingThreadRecord {
  workspaceId: string;
  threadKey: string;
  channelEndpointId: string | null;
  lastInboundAt: Date | null;
  windowExpiresAt: Date | null;
  lastTemplateAt: Date | null;
  lastConversationId: string | null;
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

  async findOrCreateMessagingThread(input: {
    workspaceId: string;
    channelEndpointId: string;
    threadKey: string;
    channelKind?: string;
    participantId?: string;
    direction?: string;
  }): Promise<{ thread: MessagingThreadRecord; conversationId: string }> {
    if (input.workspaceId !== this.workspaceId) {
      throw new WorkspaceScopeViolation(
        "messaging_thread",
        input.threadKey,
        this.workspaceId,
        input.workspaceId,
      );
    }

    return this.db.transaction(async (tx) => {
      const existingThreadRows = await tx
        .select()
        .from(schema.messagingThreads)
        .where(
          and(
            eq(schema.messagingThreads.workspaceId, this.workspaceId),
            eq(schema.messagingThreads.threadKey, input.threadKey),
          ),
        )
        .limit(1);

      if (existingThreadRows.length > 0) {
        const existingThread = existingThreadRows[0]!;
        if (existingThread.lastConversationId) {
          return {
            thread: existingThread,
            conversationId: existingThread.lastConversationId,
          };
        }

        const [createdConversation] = await tx
          .insert(schema.conversations)
          .values({
            id: `cv_${crypto.randomUUID().slice(0, 12)}`,
            workspaceId: this.workspaceId,
            channelKind: input.channelKind ?? "whatsapp",
            channelEndpointId: input.channelEndpointId,
            threadKey: input.threadKey,
            participantId: input.participantId ?? null,
            direction: input.direction ?? "inbound",
            startedAt: new Date(),
          })
          .returning();
        if (!createdConversation) {
          throw new Error(
            "ConversationRepository.findOrCreateMessagingThread: no conversation returned",
          );
        }
        const [updatedThread] = await tx
          .update(schema.messagingThreads)
          .set({ lastConversationId: createdConversation.id })
          .where(
            and(
              eq(schema.messagingThreads.workspaceId, this.workspaceId),
              eq(schema.messagingThreads.threadKey, input.threadKey),
            ),
          )
          .returning();
        if (!updatedThread) {
          throw new Error(
            "ConversationRepository.findOrCreateMessagingThread: failed to update messaging thread",
          );
        }
        return { thread: updatedThread, conversationId: createdConversation.id };
      }

      const [createdConversation] = await tx
        .insert(schema.conversations)
        .values({
          id: `cv_${crypto.randomUUID().slice(0, 12)}`,
          workspaceId: this.workspaceId,
          channelKind: input.channelKind ?? "whatsapp",
          channelEndpointId: input.channelEndpointId,
          threadKey: input.threadKey,
          participantId: input.participantId ?? null,
          direction: input.direction ?? "inbound",
          startedAt: new Date(),
        })
        .returning();
      if (!createdConversation) {
        throw new Error(
          "ConversationRepository.findOrCreateMessagingThread: no conversation returned",
        );
      }

      const [createdThread] = await tx
        .insert(schema.messagingThreads)
        .values({
          workspaceId: this.workspaceId,
          threadKey: input.threadKey,
          channelEndpointId: input.channelEndpointId,
          lastInboundAt: new Date(),
          windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastConversationId: createdConversation.id,
        })
        .returning();
      if (!createdThread) {
        throw new Error(
          "ConversationRepository.findOrCreateMessagingThread: no messaging thread returned",
        );
      }
      return { thread: createdThread, conversationId: createdConversation.id };
    });
  }

  // No softDelete — conversations table has no deletedAt column per DATA_MODEL.md
}
