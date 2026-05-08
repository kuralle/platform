import { eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";

export interface WidgetConfig {
  workspaceId: string;
  modality: string;
  theme: unknown;
  strings: unknown;
  vars: unknown;
  feedbackEnabled: boolean | null;
  termsUrl: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface WidgetConfigUpsert {
  modality?: string;
  theme?: unknown;
  strings?: unknown;
  vars?: unknown;
  feedbackEnabled?: boolean;
  termsUrl?: string | null;
}

function toDomain(row: typeof schema.widgetConfigs.$inferSelect): WidgetConfig {
  return {
    workspaceId: row.workspaceId,
    modality: row.modality,
    theme: row.theme,
    strings: row.strings,
    vars: row.vars,
    feedbackEnabled: row.feedbackEnabled,
    termsUrl: row.termsUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class WidgetRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  async getByWorkspace(): Promise<WidgetConfig | null> {
    const rows = await this.db
      .select()
      .from(schema.widgetConfigs)
      .where(eq(schema.widgetConfigs.workspaceId, this.workspaceId))
      .limit(1);
    if (rows.length === 0) return null;
    return toDomain(rows[0]!);
  }

  async upsertConfig(patch: WidgetConfigUpsert): Promise<WidgetConfig> {
    const now = new Date();
    const existing = await this.getByWorkspace();
    const merged = {
      modality: patch.modality ?? existing?.modality ?? "both",
      theme: patch.theme !== undefined ? patch.theme : existing?.theme ?? null,
      strings: patch.strings !== undefined ? patch.strings : existing?.strings ?? null,
      vars: patch.vars !== undefined ? patch.vars : existing?.vars ?? null,
      feedbackEnabled:
        patch.feedbackEnabled !== undefined
          ? patch.feedbackEnabled
          : existing?.feedbackEnabled ?? false,
      termsUrl: patch.termsUrl !== undefined ? patch.termsUrl : existing?.termsUrl ?? null,
    };

    if (existing) {
      const [row] = await this.db
        .update(schema.widgetConfigs)
        .set({
          ...merged,
          updatedAt: now,
        })
        .where(eq(schema.widgetConfigs.workspaceId, this.workspaceId))
        .returning();
      if (!row) throw new Error("WidgetRepository.upsertConfig: update returned no row");
      return toDomain(row);
    }

    const [row] = await this.db
      .insert(schema.widgetConfigs)
      .values({
        workspaceId: this.workspaceId,
        ...merged,
        updatedAt: now,
      })
      .returning();

    if (!row) throw new Error("WidgetRepository.upsertConfig: insert returned no row");
    return toDomain(row);
  }
}
