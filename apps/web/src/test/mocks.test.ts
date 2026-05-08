import { describe, it, expect } from "vitest";

import {
  makeAgents,
  makeConversations,
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

  it("makeTranscript produces ordered timestamps", () => {
    const t = makeTranscript(1);
    for (let i = 1; i < t.length; i++) {
      expect(t[i]!.timestampSec).toBeGreaterThanOrEqual(t[i - 1]!.timestampSec);
    }
  });
});
