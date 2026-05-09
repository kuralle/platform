import { describe, it, expect } from "vitest";

import { formatCompact, formatDuration, formatPct, formatRelative, formatUsd } from "@/lib/format";

describe("format helpers", () => {
  it("formats USD without cents by default", () => {
    expect(formatUsd(47200)).toBe("$47,200");
  });

  it("formats USD with two decimals when precise", () => {
    expect(formatUsd(0.32, { precise: true })).toBe("$0.32");
  });

  it("formats percentages without decimals", () => {
    expect(formatPct(0.18)).toBe("18%");
    expect(formatPct(0.005)).toBe("1%");
  });

  it("compacts large numbers", () => {
    expect(formatCompact(12_400)).toBe("12.4K");
  });

  it("formats durations as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7)).toBe("0:07");
    expect(formatDuration(125)).toBe("2:05");
  });

  it("formats relative timestamps in human steps", () => {
    expect(formatRelative(new Date(Date.now() - 30 * 1000).toISOString())).toBe("just now");
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe("5m ago");
    expect(formatRelative(new Date(Date.now() - 2 * 3_600_000).toISOString())).toBe("2h ago");
    expect(formatRelative(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe("3d ago");
  });

  describe("guard against undefined / null / NaN", () => {
    it("formatUsd returns — for undefined, null, NaN, Infinity", () => {
      expect(formatUsd(undefined)).toBe("—");
      expect(formatUsd(null)).toBe("—");
      expect(formatUsd(NaN)).toBe("—");
      expect(formatUsd(Infinity)).toBe("—");
      expect(formatUsd(-Infinity)).toBe("—");
    });

    it("formatPct returns — for undefined, null, NaN, Infinity", () => {
      expect(formatPct(undefined)).toBe("—");
      expect(formatPct(null)).toBe("—");
      expect(formatPct(NaN)).toBe("—");
      expect(formatPct(Infinity)).toBe("—");
      expect(formatPct(-Infinity)).toBe("—");
    });

    it("formatRelative returns — for undefined, null", () => {
      expect(formatRelative(undefined)).toBe("—");
      expect(formatRelative(null)).toBe("—");
    });
  });
});
