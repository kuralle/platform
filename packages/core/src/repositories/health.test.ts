import { describe, expect, it, vi } from "vitest";

import type { RepoDb } from "./types.js";
import { healthCheck } from "./health.js";

describe("healthCheck", () => {
  it("returns down when db ping fails", async () => {
    const db = {
      execute: vi.fn().mockRejectedValue(new Error("unreachable")),
    } as unknown as RepoDb;
    const s = await healthCheck(db);
    expect(s.db).toBe("down");
    if (s.db === "down") expect(s.error).toContain("unreachable");
  });

  it("returns ok with dlq depth when queries succeed", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ c: 4 }]),
        })),
      })),
    } as unknown as RepoDb;
    const s = await healthCheck(db);
    expect(s).toEqual({ db: "ok", dlqDepth: 4, ts: expect.any(String) });
  });

  it("returns down when dlq count fails", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockRejectedValue(new Error("no table")),
        })),
      })),
    } as unknown as RepoDb;
    const s = await healthCheck(db);
    expect(s.db).toBe("down");
    if (s.db === "down") expect(s.error).toContain("no table");
  });
});
