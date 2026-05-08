import type { MessagingEvent } from "../../adapter/events.js";

export function generateConversationEvents(opts: {
  conversationId: string;
  turnCount: number;
}): MessagingEvent[] {
  const events: MessagingEvent[] = [];
  let seq = 1;
  for (let turn = 1; turn <= opts.turnCount; turn += 1) {
    const occurredAt = new Date(Date.now() + turn);
    const turnId = `turn_${opts.conversationId}_${turn}`;
    events.push({
      kind: "turn.end",
      conversationId: opts.conversationId,
      sequenceNumber: seq++,
      occurredAt,
      payload: {
        turnId,
        messageId: `msg_${opts.conversationId}_${turn}`,
        fullText: `assistant turn ${turn}`,
        speaker: "assistant",
      },
    });
    events.push({
      kind: "tokens.updated",
      conversationId: opts.conversationId,
      sequenceNumber: seq++,
      occurredAt,
      payload: {
        turnId,
        turn,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        latencyMs: 50,
        cumulativeInputTokens: turn * 10,
        cumulativeOutputTokens: turn * 5,
        cumulativeTotalTokens: turn * 15,
      },
    });
  }
  return events;
}
