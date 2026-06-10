import type {
  InputProcessor,
  OutputProcessor,
} from "@kuralle-agents/core/types";
import type { AdapterLogger } from "./logger.js";

export interface CompiledRedactionPattern {
  pattern: RegExp;
  source: string;
}

export function compileRedactionPatterns(
  patterns: string[],
  logger: AdapterLogger,
): CompiledRedactionPattern[] {
  const compiled: CompiledRedactionPattern[] = [];
  for (const source of patterns) {
    try {
      compiled.push({ pattern: new RegExp(source, "g"), source });
    } catch {
      logger.warn("adapter: invalid compliance redaction regex skipped", {
        pattern: source,
      });
    }
  }
  return compiled;
}

function applyRedactions(text: string, patterns: CompiledRedactionPattern[]): string {
  let result = text;
  for (const { pattern } of patterns) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function createRedactionPatternProcessors(
  patterns: string[],
  logger: AdapterLogger,
): { inputProcessors: InputProcessor[]; outputProcessors: OutputProcessor[] } {
  const compiled = compileRedactionPatterns(patterns, logger);
  if (compiled.length === 0) {
    return { inputProcessors: [], outputProcessors: [] };
  }

  const inputProcessor: InputProcessor = {
    id: "compliance-redaction-input",
    name: "Compliance redaction (input)",
    description: "Deterministic regex redaction from complianceConfig.redactionPatterns.",
    process: async ({ input }) => {
      const redacted = applyRedactions(input, compiled);
      if (redacted === input) {
        return { action: "allow" as const };
      }
      return { action: "modify" as const, input: redacted };
    },
  };

  const outputProcessor: OutputProcessor = {
    id: "compliance-redaction-output",
    name: "Compliance redaction (output)",
    description: "Deterministic regex redaction from complianceConfig.redactionPatterns.",
    process: async ({ text }) => {
      const redacted = applyRedactions(text, compiled);
      if (redacted === text) {
        return { action: "allow" as const };
      }
      return { action: "modify" as const, text: redacted };
    },
  };

  return {
    inputProcessors: [inputProcessor],
    outputProcessors: [outputProcessor],
  };
}
