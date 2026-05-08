import { desc, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import * as schema from "@kuralle/db/schema";
import type { MessagingEvent } from "../adapter/events.js";

type TablesRelational = ExtractTablesWithRelations<typeof schema>;

export type RuntimeTx =
  | PgTransaction<NeonHttpQueryResultHKT, typeof schema, TablesRelational>
  | PgTransaction<NodePgQueryResultHKT, typeof schema, TablesRelational>;

export interface ProjectionContext {
  workspaceId: string;
  agentId: string | null;
  channelEndpointId: string | null;
}

export async function projectConversationEvent(
  tx: RuntimeTx,
  event: MessagingEvent,
  ctx: ProjectionContext,
): Promise<{ rowsInserted: number }> {
  let rowsInserted = 0;

  if (event.kind === "turn.end") {
    const result = await tx
      .insert(schema.conversationTurns)
      .values({
        id: `turn_${event.conversationId}_${event.sequenceNumber}`,
        conversationId: event.conversationId,
        ordinal: event.sequenceNumber,
        speaker: event.payload.speaker === "assistant" ? "agent" : "caller",
        text: event.payload.fullText,
        messageId: event.payload.messageId,
        timestampSec: Math.floor(event.occurredAt.getTime() / 1000),
      })
      .onConflictDoNothing()
      .returning();
    rowsInserted += result.length;
    return { rowsInserted };
  }

  if (event.kind === "tool.call" || event.kind === "tool.result") {
    const latestTurn = await tx
      .select({ id: schema.conversationTurns.id })
      .from(schema.conversationTurns)
      .where(eq(schema.conversationTurns.conversationId, event.conversationId))
      .orderBy(desc(schema.conversationTurns.ordinal))
      .limit(1);
    if (latestTurn.length === 0) return { rowsInserted };
    const turnId = latestTurn[0]!.id;
    const toolCallId = event.payload.toolCallId;
    const callId = `tool_${event.conversationId}_${toolCallId}`;

    if (event.kind === "tool.call") {
      const inserted = await tx
        .insert(schema.conversationToolCalls)
        .values({
          id: callId,
          turnId,
          toolName: event.payload.toolName,
          input: event.payload.args as Record<string, unknown>,
        })
        .onConflictDoNothing()
        .returning();
      rowsInserted += inserted.length;
      return { rowsInserted };
    }

    const updated = await tx
      .update(schema.conversationToolCalls)
      .set({
        output: {
          success: event.payload.success,
          error: event.payload.error,
        },
        durationMs: event.payload.durationMs ?? null,
        errorMessage: event.payload.error ?? null,
      })
      .where(eq(schema.conversationToolCalls.id, callId))
      .returning();

    if (updated.length === 0) {
      const inserted = await tx
        .insert(schema.conversationToolCalls)
        .values({
          id: callId,
          turnId,
          toolName: event.payload.toolName,
          output: {
            success: event.payload.success,
            error: event.payload.error,
          },
          durationMs: event.payload.durationMs ?? null,
          errorMessage: event.payload.error ?? null,
        })
        .returning();
      rowsInserted += inserted.length;
    }

    if (event.payload.extraction) {
      const rows = Object.entries(event.payload.extraction.data).map(([label, value]) => ({
        conversationId: event.conversationId,
        label,
        value: value == null ? null : String(value),
      }));
      if (rows.length > 0) {
        await tx.insert(schema.conversationExtractedFields).values(rows);
        rowsInserted += rows.length;
      }
    }
    return { rowsInserted };
  }

  if (event.kind === "tokens.updated") {
    const base = {
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      conversationId: event.conversationId,
      occurredAt: event.occurredAt,
      agentVersionId: null,
      unitCostUsd: null,
      totalCostUsd: null,
      payload: null,
    };
    const usageRows: (typeof schema.usageEvents.$inferInsert)[] = [];
    usageRows.push({
      ...base,
      id: `ue_in_${event.conversationId}_${event.sequenceNumber}`,
      kind: "llm_input_tokens",
      quantity: event.payload.inputTokens,
    });
    usageRows.push({
      ...base,
      id: `ue_out_${event.conversationId}_${event.sequenceNumber}`,
      kind: "llm_output_tokens",
      quantity: event.payload.outputTokens,
    });
    const inserted = await tx
      .insert(schema.usageEvents)
      .values(usageRows)
      .onConflictDoNothing()
      .returning();
    rowsInserted += inserted.length;
    return { rowsInserted };
  }

  if (event.kind === "agent.end" && !event.payload.success) {
    const inserted = await tx
      .insert(schema.usageEvents)
      .values({
        id: `ue_fail_${event.conversationId}_${event.sequenceNumber}`,
        workspaceId: ctx.workspaceId,
        agentId: ctx.agentId,
        conversationId: event.conversationId,
        agentVersionId: null,
        kind: "slo_violation",
        quantity: 1,
        payload: { error: event.payload.error ?? "agent-end-failed" },
        occurredAt: event.occurredAt,
      })
      .onConflictDoNothing()
      .returning();
    rowsInserted += inserted.length;
  }

  return { rowsInserted };
}
