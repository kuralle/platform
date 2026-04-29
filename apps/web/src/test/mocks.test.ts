import { describe, it, expect } from "vitest";

import {
  makeAgents,
  makeBatches,
  makeConversations,
  makeDashboardKpis,
  makePhoneNumbers,
  makeRoiReceipt,
  makeTranscript,
} from "@/mocks";

describe("mock factories", () => {
  it("makeAgents is deterministic by seed", () => {
    const a = makeAgents(10);
    const b = makeAgents(10);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a).toHaveLength(10);
    expect(a[0]!.complianceMode).toMatch(/none|hipaa|ferpa|tcpa/);
  });

  it("makeConversations marks the first two as live", () => {
    const c = makeConversations(8);
    expect(c.filter((x) => x.isLive).length).toBe(2);
    expect(c[0]!.transcript.length).toBeGreaterThan(0);
  });

  it("makeBatches recovers revenue across booked rows", () => {
    const b = makeBatches(6);
    const total = b.reduce((s, r) => s + r.recoveredRevenueUsd, 0);
    expect(total).toBeGreaterThan(0);
    for (const row of b) {
      expect(row.completed).toBeLessThanOrEqual(row.totalRecipients);
      expect(row.booked).toBeLessThanOrEqual(row.completed);
    }
  });

  it("makePhoneNumbers attaches some, leaves others", () => {
    const p = makePhoneNumbers(8);
    const attached = p.filter((n) => n.attachedAgentId).length;
    expect(attached).toBeGreaterThan(0);
    expect(attached).toBeLessThanOrEqual(p.length);
  });

  it("makeDashboardKpis exposes 5 named tiles with the right properties", () => {
    const k = makeDashboardKpis();
    expect(k).toHaveLength(5);
    expect(k.find((x) => x.label === "Recovered revenue")?.currency).toBe(true);
    expect(k.find((x) => x.label === "Live calls")?.live).toBe(true);
    expect(k.every((x) => x.spark.length === 14)).toBe(true);
  });

  it("makeRoiReceipt sums per-agent rows under recoveredRevenue", () => {
    const r = makeRoiReceipt("2026-04");
    expect(r.month).toBe("2026-04");
    expect(r.roiMultiplier).toBeGreaterThan(0);
    const sum = r.perAgent.reduce((s, p) => s + p.recovered, 0);
    expect(sum).toBeLessThanOrEqual(r.recoveredRevenueUsd);
  });

  it("makeTranscript produces ordered timestamps", () => {
    const t = makeTranscript(1);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.timestampSec).toBeGreaterThanOrEqual(t[i - 1]!.timestampSec);
    }
  });
});
