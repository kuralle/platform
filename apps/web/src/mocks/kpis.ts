import type { KpiTilePoint, RoiReceipt } from "@/types/domain";

import { createRng, spark } from "./seed";

export function makeDashboardKpis(): KpiTilePoint[] {
  const rng = createRng(0xb1de);
  return [
    {
      label: "Live calls",
      value: 2,
      delta: 0.5,
      spark: spark(rng),
      live: true,
    },
    {
      label: "Calls today",
      value: 312,
      delta: 0.18,
      spark: spark(rng),
    },
    {
      label: "Booking rate",
      value: 0.61,
      delta: 0.04,
      spark: spark(rng),
    },
    {
      label: "Recovered revenue",
      value: 47200,
      currency: true,
      delta: 0.22,
      spark: spark(rng),
    },
    {
      label: "p95 latency",
      value: 412,
      delta: -0.06,
      spark: spark(rng),
    },
  ];
}

export function makeRoiReceipt(month = "2026-04"): RoiReceipt {
  return {
    month,
    recoveredRevenueUsd: 47200,
    roiMultiplier: 121,
    costUsd: 390,
    comparisonDeltaPct: 0.34,
    perAgent: [
      { agentName: "Calderon HVAC Inbound", recovered: 21450, calls: 412 },
      { agentName: "Sundance Plumbing 24/7", recovered: 15820, calls: 308 },
      { agentName: "Brookline Dental Reminder", recovered: 9930, calls: 562 },
    ],
  };
}
