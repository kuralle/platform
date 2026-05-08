import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
} from "drizzle-orm";
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

export interface ConversationTurn {
  id: string;
  conversationId: string;
  ordinal: number;
  speaker: string | null;
  text: string;
  messageId: string | null;
  mediaPayload: unknown;
  deliveryStatus: string | null;
  statusUpdatedAt: Date | null;
  timestampSec: number;
  evalVerdict: string | null;
  workflowNodeId: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  latencyMs: number | null;
  contextUtilization: number | null;
  modelUsed: string | null;
  createdAt: Date;
}

export interface ConversationToolCall {
  id: string;
  turnId: string;
  toolId: string | null;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ConversationExtractedField {
  conversationId: string;
  label: string;
  value: string | null;
}

export interface ConversationEval {
  id: string;
  conversationId: string;
  criterionId: string | null;
  rubricSnapshot: string;
  score: number | null;
  passed: boolean | null;
  details: unknown;
  scoredAt: Date;
}

export interface ConversationDetail {
  conversation: Conversation;
  turns: ConversationTurn[];
  toolCalls: ConversationToolCall[];
  extractedFields: ConversationExtractedField[];
  evals: ConversationEval[];
}

interface ConversationCursorToken {
  startedAt: string;
  id: string;
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

function encodeCursor(cursor: ConversationCursorToken): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

function decodeCursor(cursor: string): ConversationCursorToken {
  const parsed = JSON.parse(
    Buffer.from(cursor, "base64").toString("utf8"),
  ) as Partial<ConversationCursorToken>;
  if (typeof parsed.startedAt !== "string" || typeof parsed.id !== "string") {
    throw new Error("ConversationRepository: invalid cursor");
  }
  return { startedAt: parsed.startedAt, id: parsed.id };
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

  async findManyByWorkspaceCursor(opts?: {
    cursor?: string | null;
    limit?: number;
    agentId?: string;
  }): Promise<{ items: Conversation[]; cursor: string | null }> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 20, 100));
    let cursorFilter: ReturnType<typeof or> | undefined;

    if (opts?.cursor) {
      const decoded = decodeCursor(opts.cursor);
      const startedAt = new Date(decoded.startedAt);
      cursorFilter = or(
        lt(schema.conversations.startedAt, startedAt),
        and(
          eq(schema.conversations.startedAt, startedAt),
          lt(schema.conversations.id, decoded.id),
        ),
      );
    }

    const workspaceFilter = eq(schema.conversations.workspaceId, this.workspaceId);
    const agentFilter = opts?.agentId
      ? eq(schema.conversations.agentId, opts.agentId)
      : undefined;

    let where = workspaceFilter;
    if (agentFilter && cursorFilter) {
      where = and(workspaceFilter, agentFilter, cursorFilter)!;
    } else if (agentFilter) {
      where = and(workspaceFilter, agentFilter)!;
    } else if (cursorFilter) {
      where = and(workspaceFilter, cursorFilter)!;
    }

    const rows = await this.db
      .select()
      .from(schema.conversations)
      .where(where)
      .orderBy(desc(schema.conversations.startedAt), desc(schema.conversations.id))
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({
            startedAt: last.startedAt.toISOString(),
            id: last.id,
          })
        : null;

    return {
      items: pageRows.map(toDomain),
      cursor: nextCursor,
    };
  }

  async getDetail(conversationId: string): Promise<ConversationDetail | null> {
    const conversation = await this.findById(conversationId);
    if (!conversation) {
      return null;
    }

    const turnsRows = await this.db
      .select()
      .from(schema.conversationTurns)
      .where(eq(schema.conversationTurns.conversationId, conversationId))
      .orderBy(asc(schema.conversationTurns.ordinal));

    const turnIds = turnsRows.map((turn) => turn.id);
    const toolCallRows =
      turnIds.length === 0
        ? []
        : await this.db
            .select()
            .from(schema.conversationToolCalls)
            .where(inArray(schema.conversationToolCalls.turnId, turnIds))
            .orderBy(asc(schema.conversationToolCalls.createdAt));

    const extractedFieldRows = await this.db
      .select()
      .from(schema.conversationExtractedFields)
      .where(eq(schema.conversationExtractedFields.conversationId, conversationId))
      .orderBy(asc(schema.conversationExtractedFields.label));

    const evalRows = await this.db
      .select()
      .from(schema.conversationEvals)
      .where(eq(schema.conversationEvals.conversationId, conversationId))
      .orderBy(asc(schema.conversationEvals.scoredAt));

    return {
      conversation,
      turns: turnsRows,
      toolCalls: toolCallRows,
      extractedFields: extractedFieldRows,
      evals: evalRows,
    };
  }

  async getTurnsAfterSequence(
    conversationId: string,
    afterSequence: number,
  ): Promise<ConversationTurn[]> {
    const rows = await this.db
      .select()
      .from(schema.conversationTurns)
      .where(
        and(
          eq(schema.conversationTurns.conversationId, conversationId),
          gt(schema.conversationTurns.ordinal, afterSequence),
        ),
      )
      .orderBy(asc(schema.conversationTurns.ordinal));
    return rows;
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

    // [S3-fix-2] r2 finding #2: atomic upsert pattern. The previous
    // select-then-insert raced under concurrent webhook retries and could
    // throw on the (workspace_id, thread_key) PK collision rather than
    // gracefully no-op. New flow:
    //   1. INSERT messaging_threads ... ON CONFLICT DO NOTHING — claims the
    //      row if no concurrent writer beat us.
    //   2. SELECT the row (yours or the winner's) — guarantees we have a
    //      thread row to attach a conversation to.
    //   3. If the thread already had a lastConversationId, return it.
    //   4. Otherwise insert a new conversation and update the thread atomically.
    return this.db.transaction(async (tx) => {
      // Step 1: best-effort claim.
      await tx
        .insert(schema.messagingThreads)
        .values({
          workspaceId: this.workspaceId,
          threadKey: input.threadKey,
          channelEndpointId: input.channelEndpointId,
          lastInboundAt: new Date(),
          windowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing({
          target: [
            schema.messagingThreads.workspaceId,
            schema.messagingThreads.threadKey,
          ],
        });

      // Step 2: read the canonical row (ours OR the winner's).
      const threadRows = await tx
        .select()
        .from(schema.messagingThreads)
        .where(
          and(
            eq(schema.messagingThreads.workspaceId, this.workspaceId),
            eq(schema.messagingThreads.threadKey, input.threadKey),
          ),
        )
        .limit(1);
      const thread = threadRows[0];
      if (!thread) {
        throw new Error(
          "ConversationRepository.findOrCreateMessagingThread: thread missing after upsert",
        );
      }

      // Step 3: existing conversation wins.
      if (thread.lastConversationId) {
        return { thread, conversationId: thread.lastConversationId };
      }

      // Step 4: create + attach conversation atomically.
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
    });
  }

  // No softDelete — conversations table has no deletedAt column per DATA_MODEL.md
}
