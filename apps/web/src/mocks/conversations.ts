import type { Conversation, ConversationTurn } from "@/types/domain";

import { createRng, isoMinutesAgo, pick, range } from "./seed";

const TURN_TEMPLATES: { speaker: "agent" | "caller"; text: string }[] = [
  { speaker: "agent",  text: "Thanks for calling Calderon HVAC — how can I help?" },
  { speaker: "caller", text: "Hi, my furnace stopped heating about an hour ago. It's freezing in the house." },
  { speaker: "agent",  text: "I'm sorry to hear that. Let me get a tech routed to you right away. What's your zip code?" },
  { speaker: "caller", text: "98103, I'm in the Wallingford area." },
  { speaker: "agent",  text: "Got it. We have an emergency tech who can be there between 6 and 8 PM. Does that work?" },
  { speaker: "caller", text: "Yes please, that's perfect." },
  { speaker: "agent",  text: "Booked. You'll get a text confirmation in a moment with the tech's name and ETA. Anything else?" },
  { speaker: "caller", text: "No, thank you so much." },
  { speaker: "agent",  text: "Stay warm — talk soon." },
];

export function makeTranscript(seed = 1): ConversationTurn[] {
  const rng = createRng(seed * 0x9e37);
  let t = 0;
  return TURN_TEMPLATES.map((turn, i) => {
    const dur = range(rng, 3, 9);
    const before = t;
    t += dur;
    return {
      id: `t${i}`,
      speaker: turn.speaker,
      text: turn.text,
      timestampSec: before,
      evalVerdict:
        turn.speaker === "agent" && i > 0
          ? pick(rng, ["passed", "passed", "passed", "warning"] as const)
          : undefined,
      toolCalls:
        turn.speaker === "agent" && turn.text.includes("Booked")
          ? [
              {
                id: "tc_1",
                name: "service_titan.create_job",
                input: { zip: "98103", window: "18:00-20:00", priority: "emergency" },
                output: { jobId: "JT-44912", techName: "Marcus T.", eta: "18:42" },
                durationMs: 312,
              },
            ]
          : undefined,
    } satisfies ConversationTurn;
  });
}

export function makeConversations(count = 24): Conversation[] {
  const rng = createRng(0xa1b2);
  const outcomes = ["booked", "booked", "qualified", "missed", "voicemail", "abandoned", "escalated"] as const;
  const directions = ["inbound", "inbound", "inbound", "outbound"] as const;
  return Array.from({ length: count }, (_, i) => {
    const startMin = range(rng, 1, 4 * 60);
    const dur = range(rng, 32, 540);
    const isLive = i < 2; // first two rows are live for the dashboard signal
    const transcript = makeTranscript(i + 1);
    return {
      id: `cv_${(0x80 + i).toString(16)}${pick(rng, ["a", "b", "c", "d"])}${range(rng, 0, 9)}`,
      agentId: `ag_${(0xa00 + (i % 10)).toString(16)}`,
      agentName: pick(rng, [
        "Calderon HVAC Inbound",
        "Brookline Dental Reminder",
        "Beacon University Admissions",
        "Sundance Plumbing 24/7",
      ]),
      direction: pick(rng, directions),
      callerId: `+1 ${range(rng, 200, 999)}-${range(rng, 100, 999)}-${range(rng, 1000, 9999)}`,
      callerName: rng() > 0.4 ? pick(rng, ["Sara P.", "Jamal R.", "Amelia K.", "Devon W.", "Priya R."]) : null,
      startedAt: isoMinutesAgo(startMin),
      durationSec: isLive ? range(rng, 12, 180) : dur,
      outcome: pick(rng, outcomes),
      isLive,
      recordingUrl: isLive ? null : `/recordings/cv_${i}.wav`,
      transcript,
      topics: pick(rng, [
        ["furnace", "emergency", "scheduling"],
        ["reminder", "no-show", "rescheduling"],
        ["admissions", "tour", "FERPA-disclosure"],
        ["leak", "after-hours", "dispatch"],
      ]) as string[],
      evalsPassed: range(rng, 5, 7),
      evalsTotal: 7,
      extractedFields: [
        { label: "zip", value: "98103" },
        { label: "service_window", value: "18:00-20:00" },
        { label: "appliance", value: "furnace" },
        { label: "outcome", value: "booked" },
      ],
      costUsd: Math.round(range(rng, 18, 64)) / 100,
    } satisfies Conversation;
  });
}
