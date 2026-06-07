#!/usr/bin/env bun
/**
 * Sink spike — wires every durable-event surface of `@kuralle-agents/core` into
 * local JSONL files so we can see exactly what shape the data model has to
 * receive.
 *
 * Two sinks:
 *   - stream.jsonl  ← the `HarnessStreamPart` firehose from `runtime.stream().events`
 *                     (text deltas, tool-call/result, flow-enter/transition, node-enter…)
 *   - hooks.jsonl   ← `HarnessHooks` (lifecycle, token usage, messages — the durable
 *                     surface the data-model writers consume in production)
 *
 * Scenario: a small flow — greet (with a lookup tool that can throw to surface
 * tool-error) → collect name + date → book — designed to exercise the richer
 * event types so we can map them to Kuralle tables.
 *
 * Run: `OPENAI_API_KEY=… bun run scripts/sink-spike/run.ts` (or put the key in a
 * local `scripts/sink-spike/.env`).
 */

import { openai } from "@ai-sdk/openai";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import dotenv from "dotenv";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { mkdir, appendFile } from "fs/promises";
import {
  Runtime,
  collect,
  reply,
  type AgentConfig,
  type Flow,
  type Hooks,
} from "@kuralle-agents/core";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, ".env") });

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required");
  process.exit(1);
}

const outDir = resolve(here, "out");
const streamPath = join(outDir, "stream.jsonl");
const hooksPath = join(outDir, "hooks.jsonl");

await mkdir(outDir, { recursive: true });

async function logHook(name: string, payload: unknown): Promise<void> {
  await appendFile(
    hooksPath,
    JSON.stringify({ ts: new Date().toISOString(), event: name, payload }) + "\n",
    "utf8",
  );
}

// Hook-side JSONL sink — the lifecycle surface (`Hooks`). The rich per-event
// firehose (tool calls/results, text, flow transitions) arrives through the
// stream below as `HarnessStreamPart`; `Hooks` carries the run lifecycle the
// data-model writers (sessions, conversation outcomes, usage) consume.
const hooks: Hooks = {
  onStart: (ctx) => logHook("onStart", { sessionId: ctx.session.id }),
  onStreamPart: (ctx, part) => logHook("onStreamPart", { sessionId: ctx.session.id, part }),
  onEnd: (ctx) => logHook("onEnd", { sessionId: ctx.session.id }),
  onConversationEnd: (args) =>
    logHook("onConversationEnd", {
      sessionId: args.session.id,
      outcome: args.outcome,
      usage: args.usage,
    }),
  onError: (ctx, error) => logHook("onError", { sessionId: ctx.session.id, error: error.message }),
};

// ── flow: book (reply) ← collect ← greet (reply, with a throwable lookup) ─────
const bookNode = reply({
  id: "book",
  instructions: "Confirm the appointment and call book_appointment, then end.",
  tools: {
    book_appointment: tool({
      description: "Book the confirmed appointment.",
      inputSchema: z.object({ customerName: z.string(), appointmentDate: z.string() }),
      execute: async ({ customerName, appointmentDate }) => ({
        bookingId: "BK-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        customerName,
        appointmentDate,
        confirmed: true,
      }),
    }),
  },
  next: () => ({ end: "booked" }),
});

const gatherNode = collect({
  id: "gather",
  schema: z.object({ customerName: z.string(), appointmentDate: z.string() }),
  required: ["customerName", "appointmentDate"],
  ask: (missing) => `Could you share your ${missing.join(" and ")}?`,
  onComplete: () => bookNode,
});

const greetNode = reply({
  id: "greet",
  instructions:
    "You are a booking agent for a service business. Greet the user and ask their name and preferred appointment date.",
  tools: {
    lookup_customer: tool({
      description: "Looks up an existing customer by name. Returns whether the customer is on file.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        if (name.toLowerCase().includes("error")) {
          throw new Error("Customer database temporarily unavailable");
        }
        return { onFile: name.toLowerCase() === "sarah", loyaltyTier: "gold" };
      },
    }),
  } satisfies ToolSet,
  next: () => gatherNode,
});

const bookingFlow: Flow = {
  name: "booking",
  description: "Collect the customer's name and date, then book the appointment.",
  start: greetNode,
  nodes: [greetNode, gatherNode, bookNode],
};

const model = openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini");

const agent: AgentConfig = {
  id: "kuralle-sink-spike",
  name: "Kuralle Sink Spike",
  instructions:
    "You are a booking agent. Use very simple language. Avoid emojis. Don't repeat yourself.",
  model,
  flows: [bookingFlow],
};

const runtime = new Runtime({
  agents: [agent],
  defaultAgentId: agent.id,
  defaultModel: model,
  hooks,
});

const prompts = ["Hi, I'd like to book an appointment.", "My name is Sarah.", "Next Tuesday at 10am."];
const sessionId = crypto.randomUUID();

console.log("--- Kuralle sink spike ---");

for (const input of prompts) {
  console.log("\nUser: " + input);
  let response = "";
  const handle = runtime.stream({ input, sessionId });
  for await (const part of handle.events) {
    await appendFile(streamPath, JSON.stringify(part) + "\n", "utf8");
    if (part.type === "text-delta") response += part.delta;
  }
  await handle;
  console.log("Assistant: " + response.trim());
}

console.log("\nDone. Logs at:");
console.log("  " + streamPath);
console.log("  " + hooksPath);
