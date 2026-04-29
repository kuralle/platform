import type { Batch } from "@/types/domain";

import { createRng, isoMinutesAgo, pick, range } from "./seed";

const BATCH_NAMES = [
  "Win-back Q4 — HVAC service",
  "Quote rebooking — June quotes",
  "Missed-call rescue — last 14d",
  "No-show recovery — dental",
  "Service anniversary — annual maintenance",
  "Reminder sweep — Tuesday tours",
];

export function makeBatches(count = 6): Batch[] {
  const rng = createRng(0xc0fe);
  const statuses = ["running", "completed", "scheduled", "paused", "completed", "running"] as const;
  return Array.from({ length: count }, (_, i) => {
    const total = range(rng, 120, 980);
    const completed = range(rng, Math.floor(total * 0.2), total);
    const booked = Math.floor(completed * (0.18 + rng() * 0.18));
    return {
      id: `batch_${(0xb00 + i).toString(16)}`,
      name: BATCH_NAMES[i % BATCH_NAMES.length]!,
      agentId: `ag_${(0xa00 + i).toString(16)}`,
      agentName: pick(rng, [
        "Calderon HVAC Outbound",
        "Brookline Dental Outbound",
        "Beacon University Outbound",
      ]),
      status: statuses[i % statuses.length]!,
      totalRecipients: total,
      completed,
      booked,
      failed: range(rng, 0, Math.floor(completed * 0.05)),
      scheduledFor:
        statuses[i % statuses.length] === "scheduled" ? isoMinutesAgo(-range(rng, 30, 600)) : null,
      costUsd: Math.round(completed * (0.22 + rng() * 0.18) * 100) / 100,
      recoveredRevenueUsd: Math.round(booked * range(rng, 180, 720)),
      vertical: pick(rng, ["home-services", "appointment-services", "education"] as const),
    } satisfies Batch;
  });
}
