#!/usr/bin/env node
/**
 * Sink spike — wires every AriaFlow durable-event surface into local JSONL files
 * so we can see exactly what shape the data model has to receive.
 *
 * Two sinks:
 *   - stream.jsonl   ← StreamCallbackSink, eventMode='all', emitTextDeltas=true
 *                       (captures HarnessStreamPart firehose)
 *   - hooks.jsonl    ← HarnessHooks (captures TurnUsage, ModelMessage,
 *                       lifecycle events that don't show up in the stream)
 *
 * Scenario: small flow with TWO tools (book_appointment, lookup_customer) +
 * an extraction step + a forced tool error. Designed to surface the richer
 * event types — flow-transition, tool-error, tokens:turn, suggested-questions,
 * context-compacted (won't fire on a short run, but the hook is wired) — so
 * we can map them to Kuralle tables.
 */

import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, appendFile } from 'fs/promises';
import {
  Runtime,
  createFileStreamSink,
  createFlowUpdate,
  createFlowTransition,
  type FlowAgentConfig,
  type FlowConfig,
  type HarnessHooks,
  type StreamCallbackSink,
} from '../../../../aria-flow/packages/ariaflow-core/src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const ariaRoot = resolve(here, '../../../../aria-flow');
dotenv.config({ path: join(ariaRoot, '.env') });

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

const outDir = resolve(here, 'out');
const streamPath = join(outDir, 'stream.jsonl');
const hooksPath = join(outDir, 'hooks.jsonl');

await mkdir(outDir, { recursive: true });

// Hook-side JSONL sink — this is the surface the data-model writers (turns,
// tool calls, usage_events, session_checkpoints) will consume in production.
async function logHook(name: string, payload: unknown) {
  await appendFile(
    hooksPath,
    JSON.stringify({ ts: new Date().toISOString(), event: name, payload }) + '\n',
    'utf8',
  );
}

const hooks: HarnessHooks = {
  onStart: async ctx => logHook('onStart', { sessionId: ctx.session.id, agentId: ctx.agent.id }),
  onEnd: async (ctx, res) =>
    logHook('onEnd', { sessionId: ctx.session.id, success: res.success, error: res.error?.message }),
  onSessionEnd: async (session, meta) =>
    logHook('onSessionEnd', { sessionId: session.id, ...meta }),
  onStepStart: async (ctx, step) =>
    logHook('onStepStart', { sessionId: ctx.session.id, agentId: ctx.agent.id, step }),
  onStepEnd: async (ctx, step, result) =>
    logHook('onStepEnd', {
      sessionId: ctx.session.id,
      agentId: ctx.agent.id,
      step,
      finishReason: result.finishReason,
      tokensUsed: result.tokensUsed,
      toolCallCount: result.toolCalls.length,
      handoffTo: result.handoffTo,
    }),
  onToolCall: async (ctx, call) =>
    logHook('onToolCall', {
      sessionId: ctx.session.id,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      args: call.input,
    }),
  onToolResult: async (ctx, call) =>
    logHook('onToolResult', {
      sessionId: ctx.session.id,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: call.output,
      durationMs: call.durationMs,
    }),
  onToolError: async (ctx, call, error) =>
    logHook('onToolError', {
      sessionId: ctx.session.id,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      error: error.message,
    }),
  onAgentStart: async (ctx, agentId) => logHook('onAgentStart', { sessionId: ctx.session.id, agentId }),
  onAgentEnd: async (ctx, agentId) => logHook('onAgentEnd', { sessionId: ctx.session.id, agentId }),
  onHandoff: async (ctx, from, to, reason) =>
    logHook('onHandoff', { sessionId: ctx.session.id, from, to, reason }),
  onMessage: async (ctx, message) =>
    logHook('onMessage', {
      sessionId: ctx.session.id,
      role: message.role,
      content: message.content,
    }),
  onTokensUpdate: async (ctx, turn) =>
    logHook('onTokensUpdate', { sessionId: ctx.session.id, ...turn }),
  onError: async (ctx, error) =>
    logHook('onError', { sessionId: ctx.session.id, error: error.message }),
  onBeforeModelCall: async (ctx, data) =>
    logHook('onBeforeModelCall', {
      sessionId: ctx.session.id,
      agentId: data.agentId,
      estimatedTokens: data.estimatedTokens,
      tokenBreakdown: data.tokenBreakdown,
      messageCount: data.messages.length,
    }),
};

// Flow with three nodes: greet → extract → confirm.
const extractionSchema = z.object({
  customerName: z.string().nullable(),
  appointmentDate: z.string().nullable(),
});

function createFlow(): FlowConfig {
  return {
    nodes: [
      {
        id: 'greet',
        prompt:
          'You are a booking agent for a service business. Greet the user and ask their name and preferred appointment date.',
        tools: ctx => ({
          lookup_customer: tool({
            description:
              'Looks up an existing customer by name. Returns whether the customer is on file.',
            inputSchema: z.object({ name: z.string() }),
            execute: async ({ name }) => {
              if (name.toLowerCase().includes('error')) {
                throw new Error('Customer database temporarily unavailable');
              }
              return { onFile: name.toLowerCase() === 'sarah', loyaltyTier: 'gold' };
            },
          }),
          continue_to_booking: tool({
            description: 'Continue to the booking step once name and date are collected.',
            inputSchema: z.object({}),
            execute: async () => {
              const data = ctx.collectedData;
              const name = typeof data.customerName === 'string' ? data.customerName : null;
              const date = typeof data.appointmentDate === 'string' ? data.appointmentDate : null;
              if (!name || !date) {
                return createFlowUpdate(
                  {},
                  'Still need name and date',
                  ['customerName', 'appointmentDate'],
                );
              }
              return createFlowTransition('book', { customerName: name, appointmentDate: date });
            },
          }),
        }),
      },
      {
        id: 'book',
        prompt: 'Confirm the appointment and call book_appointment. Then end.',
        tools: ctx => ({
          book_appointment: tool({
            description: 'Book the confirmed appointment.',
            inputSchema: z.object({
              customerName: z.string(),
              appointmentDate: z.string(),
            }),
            execute: async ({ customerName, appointmentDate }) => {
              return {
                bookingId: 'BK-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                customerName,
                appointmentDate,
                confirmed: true,
              };
            },
          }),
        }),
      },
    ],
  };
}

const model = openai(process.env.OPENAI_MODEL ?? 'gpt-4o-mini') as any;

const agent: FlowAgentConfig = {
  id: 'kuralle-sink-spike',
  name: 'Kuralle Sink Spike',
  type: 'flow',
  prompt:
    "You are a booking agent. Use very simple language. Avoid emojis. Don't repeat yourself.",
  model,
  flow: createFlow(),
  initialNode: 'greet',
  mode: 'strict',
  extraction: {
    schema: extractionSchema,
    requiredFields: ['customerName', 'appointmentDate'],
    systemPrompt:
      'Extract the customer name and appointment date from the conversation. Set fields to null if not yet provided.',
    memoryKey: 'extraction:kuralle-sink-spike',
  },
};

const streamSink: StreamCallbackSink = createFileStreamSink({
  path: streamPath,
  format: 'jsonl',
});

const runtime = new Runtime({
  agents: [agent],
  defaultAgentId: agent.id,
  defaultModel: agent.model,
  hooks,
  streamCallback: {
    sinks: [streamSink],
    eventMode: 'all',
    emitTextDeltas: true,
    emitToolEvents: true,
    emitTransitionEvents: true,
    emitFinalText: true,
    flushOnEnd: true,
  },
});

const prompts = [
  "Hi, I'd like to book an appointment.",
  "My name is Sarah.",
  "Next Tuesday at 10am.",
];

let sessionId: string | undefined;
console.log('--- Kuralle sink spike ---');

for (const input of prompts) {
  console.log('\nUser: ' + input);
  let response = '';
  for await (const part of runtime.stream({ input, sessionId })) {
    if (part.type === 'text-delta') response += part.text;
    if (part.type === 'done') sessionId = part.sessionId;
  }
  console.log('Assistant: ' + response.trim());
}

console.log('\nDone. Logs at:');
console.log('  ' + streamPath);
console.log('  ' + hooksPath);
