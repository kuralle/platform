import type { Agent, ComplianceMode, LlmProvider } from "@/types/domain";

import { createRng, isoMinutesAgo, pick, range } from "./seed";

const PROVIDERS: LlmProvider[] = ["openai", "anthropic", "google"];
const MODEL_BY_PROVIDER: Record<LlmProvider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "o1-mini"],
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

const VOICE_LIBRARY = [
  { id: "v_aurora",  name: "Aurora",  language: "en-US" },
  { id: "v_rio",     name: "Rio",     language: "es-MX" },
  { id: "v_hawthorn",name: "Hawthorn",language: "en-GB" },
  { id: "v_lyra",    name: "Lyra",    language: "en-US" },
  { id: "v_castor",  name: "Castor",  language: "en-AU" },
];

const COMPLIANCE_BY_VERTICAL: Record<string, ComplianceMode> = {
  "home-services": "tcpa",
  "appointment-services": "hipaa",
  "education": "ferpa",
};

const AGENT_NAMES = [
  "Calderon HVAC Inbound",
  "Sundance Plumbing 24/7",
  "Brookline Dental Reminder",
  "Riverbend Vet Booking",
  "Beacon University Admissions",
  "Apex Electric Quote-Reback",
  "Glen Park Salon Reschedule",
  "Tidewater Med Group Triage",
  "Northgate Bootcamp Tour",
  "Maple Hill Realty Inbound",
];

export function makeAgents(count = 10, vertical = "home-services"): Agent[] {
  const rng = createRng(0xa9e7c0);
  return Array.from({ length: count }, (_, i) => {
    const provider = pick(rng, PROVIDERS);
    const model = pick(rng, MODEL_BY_PROVIDER[provider]);
    const voice = pick(rng, VOICE_LIBRARY);
    const status = pick(rng, ["live", "live", "live", "paused", "draft"] as const);
    return {
      id: `ag_${(0xa00 + i).toString(16)}`,
      name: AGENT_NAMES[i % AGENT_NAMES.length]!,
      status,
      llmProvider: provider,
      llmModel: model,
      voiceId: voice.id,
      voiceName: voice.name,
      language: voice.language,
      complianceMode: COMPLIANCE_BY_VERTICAL[vertical] ?? "none",
      calls7d: range(rng, 8, 412),
      bookingRate: Math.round(range(rng, 32, 78)) / 100,
      costPerCall: Math.round(range(rng, 18, 64)) / 100,
      createdAt: isoMinutesAgo(range(rng, 2880, 60000)),
      updatedAt: isoMinutesAgo(range(rng, 5, 1440)),
      firstMessage:
        "Thanks for calling Calderon HVAC, this is your virtual dispatcher — how can I help today?",
      systemPrompt:
        "You are a calm, professional dispatcher for an HVAC operator-owned business. Triage each call into one of four buckets: (1) emergency no-heat / no-AC, (2) routine maintenance booking, (3) quote follow-up, (4) general info. Always confirm zip code and preferred service window. Never quote pricing. If the caller is hostile, escalate to a human in under 30 seconds.",
      temperature: 0.4,
    } satisfies Agent;
  });
}
