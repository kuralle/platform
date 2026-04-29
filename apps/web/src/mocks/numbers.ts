import type { PhoneNumber } from "@/types/domain";

import { createRng, pick, range } from "./seed";

export function makePhoneNumbers(count = 8): PhoneNumber[] {
  const rng = createRng(0xd1a1);
  return Array.from({ length: count }, (_, i) => ({
    id: `pn_${(0xf00 + i).toString(16)}`,
    number: `+1 ${range(rng, 200, 999)} ${range(rng, 100, 999)} ${range(rng, 1000, 9999)}`,
    provider: pick(rng, ["twilio-native", "twilio-native", "twilio-byo", "sip"] as const),
    region: pick(rng, ["US-WA", "US-CA", "US-TX", "US-NY", "US-MA"]),
    attachedAgentId: rng() > 0.25 ? `ag_${(0xa00 + (i % 10)).toString(16)}` : null,
    recording: rng() > 0.3,
  }));
}
