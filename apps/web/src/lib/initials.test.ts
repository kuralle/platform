import { describe, it, expect } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it("returns ?? for empty string", () => {
    expect(getInitials("")).toBe("??");
  });

  it("returns first two letters for single-token name", () => {
    expect(getInitials("Maria")).toBe("MA");
  });

  it("returns first letter of first and last token for two-token name", () => {
    expect(getInitials("RJ Calderon")).toBe("RC");
  });

  it("returns first letter of first and last token for three-token name", () => {
    expect(getInitials("Maria Elena Santos")).toBe("MS");
  });

  it("handles leading/trailing whitespace", () => {
    expect(getInitials("  RJ Calderon  ")).toBe("RC");
  });

  it("handles multiple spaces between tokens", () => {
    expect(getInitials("RJ   Calderon")).toBe("RC");
  });

  it("handles lowercase input", () => {
    expect(getInitials("maria santos")).toBe("MS");
  });

  it("handles single character name", () => {
    expect(getInitials("A")).toBe("A");
  });
});
