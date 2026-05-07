import { appRouter } from "@kuralle/api/routers/index";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { execSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

const doc = await generator.generate(appRouter, {
  info: { title: "Kuralle API", version: "0.1.0" },
});

function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return obj;
}

const sorted = sortKeys(doc);
const json = `${JSON.stringify(sorted, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const expectedPath = join(import.meta.dirname, "..", "openapi.json");
  const tmpPath = join(tmpdir(), `gen-openapi-${Date.now()}.json`);
  writeFileSync(tmpPath, json);

  try {
    execSync(`diff "${tmpPath}" "${expectedPath}"`, { stdio: "pipe" });
    console.log("✅ OpenAPI spec matches committed openapi.json");
    process.exit(0);
  } catch {
    console.error(
      "❌ OpenAPI spec drift detected! Run 'bun -F server gen:openapi' and commit the result.",
    );
    process.exit(1);
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch (err) {
      console.warn(`failed to clean up temp file ${tmpPath}:`, err);
    }
  }
} else {
  const outputPath = join(import.meta.dirname, "..", "openapi.json");
  writeFileSync(outputPath, json);
  console.log(`✅ OpenAPI spec written to ${outputPath}`);
}
