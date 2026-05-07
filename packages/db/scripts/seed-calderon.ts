import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/server/.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

// Deterministic IDs
const WS = "ws_calderon";
const AGENTS = {
  dispatcher: "ag_calderon_dispatcher",
  intake: "ag_calderon_intake",
  titleix: "ag_calderon_titleix",
} as const;
const AVS = {
  dispatcher: "av_calderon_dispatcher_v1",
  intake: "av_calderon_intake_v1",
  titleix: "av_calderon_titleix_v1",
} as const;
const CH = "ch_calderon_voice";
const CE = "ce_calderon_e164_main";
const KB = "kb_calderon_pricing_q4";
const WH = "wh_calderon_main";
const CV_PREFIX = "cv_calderon_";

// Frozen base date for deterministic timestamps
const BASE_DATE = "2026-04-01T10:00:00.000Z";

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

// Agent IR snapshot shape per DATA_MODEL.md §5:347-365
function makeSnapshot(
  name: string,
  instructions: string,
  description: string,
  voiceId: string,
) {
  return JSON.stringify({
    name,
    description,
    instructions,
    model: {
      provider: "openai",
      name: "gpt-4o",
      temperature: 0.4,
    },
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
      pipelineMode: "stt-llm-tts",
      ttsModel: "cartesia-sonic-3",
      ttsVoiceId: voiceId,
      sttModel: "deepgram-nova-3-monolingual",
      sttLanguage: "en",
    },
    channelConfig: {},
    complianceConfig: {
      retentionDays: 90,
      redactionPatterns: [],
      disclosureScript: "",
    },
    requestContextSchema: {},
  });
}

type ConversationSeed = {
  id: string;
  threadKey: string;
  outcome: string;
  durationSec: number;
  startedAtOffsetMin: number;
  participantId: string;
  turns: { speaker: string; text: string }[];
};

const CONVERSATIONS: ConversationSeed[] = [
  {
    id: `${CV_PREFIX}001`,
    threadKey: "voice:calderon-call-001",
    outcome: "booked",
    durationSec: 187,
    startedAtOffsetMin: -60,
    participantId: "+12065550142",
    turns: [
      { speaker: "agent", text: "Thanks for calling Calderon HVAC — how can I help?" },
      { speaker: "caller", text: "Hi, my furnace stopped heating about an hour ago. It's freezing in the house." },
      { speaker: "agent", text: "I'm sorry to hear that. Let me get a tech routed to you right away. What's your zip code?" },
      { speaker: "caller", text: "98103, I'm in the Wallingford area." },
      { speaker: "agent", text: "Got it. We have an emergency tech who can be there between 6 and 8 PM. Does that work?" },
      { speaker: "caller", text: "Yes please, that's perfect." },
    ],
  },
  {
    id: `${CV_PREFIX}002`,
    threadKey: "voice:calderon-call-002",
    outcome: "qualified",
    durationSec: 234,
    startedAtOffsetMin: -180,
    participantId: "+14255550398",
    turns: [
      { speaker: "agent", text: "Thanks for calling Calderon HVAC — how can I help?" },
      { speaker: "caller", text: "I'm looking to get a quote for a full HVAC system replacement." },
      { speaker: "agent", text: "I'd be happy to help with that. Can I get your address and a good time for an estimator to come by?" },
      { speaker: "caller", text: "Sure, 4521 California Ave SW, 98116. Weekday mornings work best." },
      { speaker: "agent", text: "Great, I'll get that scheduled. One of our estimators will call you Monday morning to confirm." },
    ],
  },
  {
    id: `${CV_PREFIX}003`,
    threadKey: "voice:calderon-call-003",
    outcome: "missed",
    durationSec: 42,
    startedAtOffsetMin: -300,
    participantId: "+13605550177",
    turns: [
      { speaker: "agent", text: "Thanks for calling Calderon HVAC — how can I help?" },
      { speaker: "caller", text: "Oh, I didn't expect a machine. Uh, I'll call back later." },
      { speaker: "agent", text: "No worries at all — I can help you right now actually. What do you need?" },
    ],
  },
  {
    id: `${CV_PREFIX}004`,
    threadKey: "voice:calderon-call-004",
    outcome: "voicemail",
    durationSec: 18,
    startedAtOffsetMin: -480,
    participantId: "+15105550284",
    turns: [
      { speaker: "agent", text: "Thanks for calling Calderon HVAC — how can I help?" },
      { speaker: "caller", text: "..." },
      { speaker: "agent", text: "It sounds like I reached your voicemail. I'll leave a message — this is Calderon HVAC returning your call." },
    ],
  },
  {
    id: `${CV_PREFIX}005`,
    threadKey: "voice:calderon-call-005",
    outcome: "escalated",
    durationSec: 312,
    startedAtOffsetMin: -720,
    participantId: "+12125550931",
    turns: [
      { speaker: "agent", text: "Thanks for calling Calderon HVAC — how can I help?" },
      { speaker: "caller", text: "This is the third time I'm calling about the same issue. Your tech never showed up yesterday." },
      { speaker: "agent", text: "I'm really sorry about that. Let me pull up your record right now." },
      { speaker: "caller", text: "I want to speak to a manager. This is unacceptable." },
      { speaker: "agent", text: "Absolutely, I understand your frustration. Let me transfer you to our service manager right away." },
      { speaker: "caller", text: "Thank you." },
    ],
  },
];

const AGENT_DEFS = [
  {
    id: AGENTS.dispatcher,
    status: "published",
    snapshot: makeSnapshot(
      "Calderon HVAC Inbound",
      "You are a calm, professional dispatcher for an HVAC operator-owned business. Triage each call into one of four buckets: (1) emergency no-heat / no-AC, (2) routine maintenance booking, (3) quote follow-up, (4) general info. Always confirm zip code and preferred service window. Never quote pricing. If the caller is hostile, escalate to a human in under 30 seconds.",
      "Inbound dispatcher for HVAC operators. Triages emergency / routine / quote / info calls; books service windows; escalates to a human when a caller turns hostile.",
      "v_aurora",
    ),
  },
  {
    id: AGENTS.intake,
    status: "published",
    snapshot: makeSnapshot(
      "Calderon Appointment Intake",
      "You are an appointment intake specialist for a home-services company. Collect the caller's name, address, phone number, preferred date/time, and service type. Confirm all details before booking. If the caller needs an emergency appointment, flag it for priority routing.",
      "Appointment intake agent. Collects caller details and books service appointments with confirmation.",
      "v_lyra",
    ),
  },
  {
    id: AGENTS.titleix,
    status: "published",
    snapshot: makeSnapshot(
      "Title-IX Compliance Intake",
      "You are a Title-IX compliance intake agent for an educational institution. Collect incident details with sensitivity and neutrality. Explain the reporter's rights and available resources. Do not make determinations — forward all reports to the Title-IX coordinator. Maintain strict confidentiality.",
      "Title-IX compliance intake agent for education. Collects incident reports with sensitivity and forwards to the coordinator.",
      "v_hawthorn",
    ),
  },
] as const;

const AV_PAIRS: { agentId: string; avId: string; snapshot: string }[] = [
  { agentId: AGENTS.dispatcher, avId: AVS.dispatcher, snapshot: AGENT_DEFS[0].snapshot },
  { agentId: AGENTS.intake, avId: AVS.intake, snapshot: AGENT_DEFS[1].snapshot },
  { agentId: AGENTS.titleix, avId: AVS.titleix, snapshot: AGENT_DEFS[2].snapshot },
];

async function main() {
  const client = await pool.connect();
  let inserted = 0;

  try {
    await client.query("BEGIN");

    // ─── 1. Organization ───────────────────────────────────────────
    const orgRes = await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, metadata, vertical, is_personal, created_at, updated_at)
       VALUES ($1, 'Calderon HVAC', 'calderon-hvac', 'production', 'us-east-1', 'tcpa', '{"vertical":"home-services"}', 'home-services', false, $2, $2)
       ON CONFLICT (id) DO NOTHING`,
      [WS, BASE_DATE],
    );
    if (orgRes.rowCount && orgRes.rowCount > 0) inserted++;
    log(`organization: ${orgRes.rowCount} row(s)`);

    // ─── 2. Agents (active_version_id = NULL initially) ────────────
    for (const a of AGENT_DEFS) {
      const res = await client.query(
        `INSERT INTO agents (id, workspace_id, status, created_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [a.id, WS, a.status, BASE_DATE],
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
      log(`agent ${a.id}: ${res.rowCount} row(s)`);
    }

    // ─── 3. Agent versions ─────────────────────────────────────────
    for (const av of AV_PAIRS) {
      const res = await client.query(
        `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot, published_at)
         VALUES ($1, $2, 1, 'publish', $3::jsonb, $4)
         ON CONFLICT (id) DO NOTHING`,
        [av.avId, av.agentId, av.snapshot, BASE_DATE],
      );
      if (res.rowCount && res.rowCount > 0) inserted++;
      log(`agent_version ${av.avId}: ${res.rowCount} row(s)`);
    }

    // ─── 4. Link agents.active_version_id ──────────────────────────
    for (const av of AV_PAIRS) {
      await client.query(
        `UPDATE agents SET active_version_id = $1 WHERE id = $2 AND active_version_id IS NULL`,
        [av.avId, av.agentId],
      );
    }

    // ─── 5. Channel connection (voice, mock Twilio) ────────────────
    const chRes = await client.query(
      `INSERT INTO channel_connections (id, workspace_id, channel_kind, provider, display_name, status, config, created_at)
       VALUES ($1, $2, 'voice', 'twilio-native', 'Calderon HVAC Voice', 'connected', '{"twilioAccountSid":"AC_DEMO","mockMode":true}'::jsonb, $3)
       ON CONFLICT (id) DO NOTHING`,
      [CH, WS, BASE_DATE],
    );
    if (chRes.rowCount && chRes.rowCount > 0) inserted++;
    log(`channel_connection ${CH}: ${chRes.rowCount} row(s)`);

    // ─── 6. Channel endpoint (phone number) ────────────────────────
    const ceRes = await client.query(
      `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id, attached_agent_version_id, display_name, created_at)
       VALUES ($1, $2, $3, 'voice', '+15559870001', $4, $5, 'Main Line', $6)
       ON CONFLICT (id) DO NOTHING`,
      [CE, WS, CH, AGENTS.dispatcher, AVS.dispatcher, BASE_DATE],
    );
    if (ceRes.rowCount && ceRes.rowCount > 0) inserted++;
    log(`channel_endpoint ${CE}: ${ceRes.rowCount} row(s)`);

    // ─── 7. Conversations + turns ──────────────────────────────────
    for (const cv of CONVERSATIONS) {
      const startedAt = new Date(
        new Date(BASE_DATE).getTime() + cv.startedAtOffsetMin * 60_000,
      ).toISOString();
      const endedAt = new Date(
        new Date(startedAt).getTime() + cv.durationSec * 1000,
      ).toISOString();

      const cvRes = await client.query(
        `INSERT INTO conversations (id, workspace_id, agent_id, agent_version_id, channel_kind, channel_endpoint_id, thread_key, direction, participant_id, started_at, ended_at, duration_sec, outcome, cost_usd)
         VALUES ($1, $2, $3, $4, 'voice', $5, $6, 'inbound', $7, $8, $9, $10, $11, 0.42)
         ON CONFLICT (id) DO NOTHING`,
        [
          cv.id,
          WS,
          AGENTS.dispatcher,
          AVS.dispatcher,
          CE,
          cv.threadKey,
          cv.participantId,
          startedAt,
          endedAt,
          cv.durationSec,
          cv.outcome,
        ],
      );
      if (cvRes.rowCount && cvRes.rowCount > 0) inserted++;

      // Turns
      let timestampSec = 0;
      for (let i = 0; i < cv.turns.length; i++) {
        const turn = cv.turns[i]!;
        const turnId = `cvt_${cv.id.slice(-3)}_${i + 1}`;
        const dur = turn.speaker === "agent" ? 5 : 4;
        const tsSec = timestampSec;
        timestampSec += dur;

        const tRes = await client.query(
          `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, timestamp_sec)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [turnId, cv.id, i + 1, turn.speaker, turn.text, tsSec],
        );
        if (tRes.rowCount && tRes.rowCount > 0) inserted++;
      }
    }
    log("conversations + turns: seeded");

    // ─── 8. KB document ────────────────────────────────────────────
    const kbRes = await client.query(
      `INSERT INTO kb_documents (id, workspace_id, name, source, size_bytes, status, rag_indexed, embedding_model, created_at)
       VALUES ($1, $2, 'Calderon HVAC pricing book Q4.pdf', 'file', 42000, 'ready', true, 'openai-text-embedding-3-large', $3)
       ON CONFLICT (id) DO NOTHING`,
      [KB, WS, BASE_DATE],
    );
    if (kbRes.rowCount && kbRes.rowCount > 0) inserted++;
    log(`kb_document ${KB}: ${kbRes.rowCount} row(s)`);

    // ─── 9. Webhook ────────────────────────────────────────────────
    const whRes = await client.query(
      `INSERT INTO webhooks (id, workspace_id, url, events, signing_secret, active, created_at)
       VALUES ($1, $2, 'https://hooks.calderonhvac.com/api/calls', ARRAY['conversation.completed','batch.completed'], 'whsec_demo_calderon_seed', true, $3)
       ON CONFLICT (id) DO NOTHING`,
      [WH, WS, BASE_DATE],
    );
    if (whRes.rowCount && whRes.rowCount > 0) inserted++;
    log(`webhook ${WH}: ${whRes.rowCount} row(s)`);

    await client.query("COMMIT");
    log(`Done. Total new rows inserted: ${inserted}`);
  } catch (err: unknown) {
    await client.query("ROLLBACK");
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[seed] FATAL: ${msg}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
