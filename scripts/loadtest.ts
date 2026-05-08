#!/usr/bin/env bun
/**
 * Load test for the Sprint 3 fix surface — JMeter-equivalent in bun.
 *
 * Two scenarios:
 *   A) write contention — N concurrent agents.publish on the SAME agent
 *      (exercises BL-S3-08 fix + the unique-index race). Expected: 1 success,
 *      N-1 CONFLICT per batch.
 *   B) read throughput — N concurrent agents.list (cheap path through Pool).
 *      Expected: 100% 200 OK; measures Pool cold-start tax.
 *
 * Captures p50/p95/p99 latency, RPS, error categorization.
 *
 * Usage:
 *   bun scripts/loadtest.ts [scenario] [concurrency] [iterations]
 *     scenario:    "A" | "B" | "both" (default: both)
 *     concurrency: parallel requests per batch (default: 10)
 *     iterations:  number of batches (default: 5)
 */
const SERVER = process.env.LOADTEST_SERVER ?? "http://localhost:8787";
const WS = "ws_calderon_hvac";
const AGENT = "ag_demo_calderon";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx]!;
}

function summarize(label: string, results: { ms: number; status: number; code?: string; err?: string }[]) {
  const ok = results.filter((r) => r.status >= 200 && r.status < 300);
  const fail = results.filter((r) => !(r.status >= 200 && r.status < 300));
  const latencies = ok.map((r) => r.ms).sort((a, b) => a - b);
  const totalDurS = (Math.max(...results.map((r) => r.ms)) || 1) / 1000;
  const errCats = new Map<string, number>();
  for (const f of fail) {
    const key = f.code ?? `HTTP_${f.status}`;
    errCats.set(key, (errCats.get(key) ?? 0) + 1);
  }
  console.log(`\n── ${label} ──`);
  console.log(`  total requests:        ${results.length}`);
  console.log(`  ok:                    ${ok.length}`);
  console.log(`  failed:                ${fail.length}`);
  console.log(`  error rate:            ${((fail.length / results.length) * 100).toFixed(1)}%`);
  if (errCats.size > 0) {
    console.log(`  error breakdown:`);
    for (const [k, v] of errCats) console.log(`    ${k}: ${v}`);
  }
  if (ok.length > 0) {
    console.log(`  latency (ok only, ms):`);
    console.log(`    min:                 ${latencies[0]}`);
    console.log(`    p50:                 ${percentile(latencies, 0.5)}`);
    console.log(`    p95:                 ${percentile(latencies, 0.95)}`);
    console.log(`    p99:                 ${percentile(latencies, 0.99)}`);
    console.log(`    max:                 ${latencies[latencies.length - 1]}`);
    console.log(`    mean:                ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)}`);
  }
  console.log(`  throughput (ok/total): ${(ok.length / totalDurS).toFixed(1)} req/s`);
}

async function signUp(email: string): Promise<string> {
  const res = await fetch(`${SERVER}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Demo12345!", name: "Load Test" }),
  });
  if (res.status !== 200) throw new Error(`signup failed ${res.status}: ${await res.text()}`);
  const cookies = res.headers.getSetCookie();
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

const SAMPLE_IR = {
  name: "Loadtest Agent",
  description: "Loadtest IR",
  instructions: "x",
  model: { provider: "openai" as const, name: "gpt-4o", temperature: 0.4 },
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  subagentAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: { nodes: [], edges: [] },
  scorerAttachments: {},
  voiceConfig: {
    pipelineMode: "stt-llm-tts" as const,
    ttsModel: "cartesia-sonic-3",
    ttsVoiceId: "v_aurora",
    sttModel: "deepgram-nova-3-monolingual",
    sttLanguage: "en",
  },
  channelConfig: {},
  complianceConfig: { retentionDays: 90, redactionPatterns: [], disclosureScript: "" },
  requestContextSchema: {},
};

async function callRpc(path: string, input: unknown, cookie: string): Promise<{ ms: number; status: number; code?: string; err?: string }> {
  const t0 = performance.now();
  let status = 0;
  let code: string | undefined;
  let err: string | undefined;
  try {
    const res = await fetch(`${SERVER}/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ json: input }),
    });
    status = res.status;
    if (status !== 200) {
      const body = await res.text();
      try {
        const parsed = JSON.parse(body);
        code = parsed?.json?.code ?? parsed?.code;
        err = (parsed?.json?.message ?? parsed?.message ?? body).slice(0, 80);
      } catch {
        err = body.slice(0, 80);
      }
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    code = "FETCH_ERROR";
  }
  return { ms: Math.round(performance.now() - t0), status, code, err };
}

async function scenarioA(cookie: string, concurrency: number, iterations: number) {
  console.log(`\n══ Scenario A: ${concurrency} concurrent agents.publish on ${AGENT}, x${iterations} batches ══`);
  const all: Awaited<ReturnType<typeof callRpc>>[] = [];
  for (let i = 0; i < iterations; i++) {
    const fired = await Promise.all(
      Array.from({ length: concurrency }, () =>
        callRpc("agents/publish", { workspaceId: WS, agentId: AGENT, ir: SAMPLE_IR }, cookie),
      ),
    );
    all.push(...fired);
    const ok = fired.filter((r) => r.status === 200).length;
    const conflict = fired.filter((r) => r.code === "CONFLICT").length;
    console.log(`  batch ${i + 1}: ${ok} ok, ${conflict} CONFLICT, ${fired.length - ok - conflict} other`);
  }
  summarize("Scenario A — write contention", all);
}

async function scenarioB(cookie: string, concurrency: number, iterations: number) {
  console.log(`\n══ Scenario B: ${concurrency} concurrent agents.list, x${iterations} batches ══`);
  const all: Awaited<ReturnType<typeof callRpc>>[] = [];
  for (let i = 0; i < iterations; i++) {
    const fired = await Promise.all(
      Array.from({ length: concurrency }, () =>
        callRpc("agents/list", { workspaceId: WS, limit: 5 }, cookie),
      ),
    );
    all.push(...fired);
  }
  summarize("Scenario B — read throughput", all);
}

const scenario = (process.argv[2] ?? "both") as "A" | "B" | "both";
const concurrency = parseInt(process.argv[3] ?? "10", 10);
const iterations = parseInt(process.argv[4] ?? "5", 10);

const stamp = Date.now();
const cookie = await signUp(`loadtest-${stamp}@kuralle.local`);
console.log(`✓ authenticated, cookie length=${cookie.length}`);

if (scenario === "A" || scenario === "both") await scenarioA(cookie, concurrency, iterations);
if (scenario === "B" || scenario === "both") await scenarioB(cookie, concurrency, iterations);

console.log("");
