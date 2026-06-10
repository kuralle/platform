import { describe, it, expect } from "vitest";
import {
  compileRedactionPatterns,
  createRedactionPatternProcessors,
} from "./redaction-patterns.js";
import { noopAdapterLogger } from "./logger.js";

describe("redaction patterns", () => {
  it("skips invalid regex patterns with a warning", () => {
    const warnings: string[] = [];
    const logger = {
      warn: (msg: string) => warnings.push(msg),
    };
    const compiled = compileRedactionPatterns(["[invalid", "\\d{4}"], logger);
    expect(compiled).toHaveLength(1);
    expect(warnings.length).toBe(1);
  });

  it("rewrites matching input and output text", async () => {
    const { inputProcessors, outputProcessors } = createRedactionPatternProcessors(
      ["\\bSECRET-\\d+\\b"],
      noopAdapterLogger(),
    );

    const inputResult = await inputProcessors[0]!.process({
      input: "token SECRET-12345 here",
      messages: [],
      context: {},
    });
    expect(inputResult).toEqual({
      action: "modify",
      input: "token [REDACTED] here",
    });

    const outputResult = await outputProcessors[0]!.process({
      text: "leaked SECRET-99999",
      messages: [],
      context: {},
    });
    expect(outputResult).toEqual({
      action: "modify",
      text: "leaked [REDACTED]",
    });
  });

  it("allows text with no pattern match", async () => {
    const { inputProcessors } = createRedactionPatternProcessors(
      ["\\bSECRET-\\d+\\b"],
      noopAdapterLogger(),
    );
    const result = await inputProcessors[0]!.process({
      input: "clean text",
      messages: [],
      context: {},
    });
    expect(result).toEqual({ action: "allow" });
  });
});
