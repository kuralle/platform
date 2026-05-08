import { eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";

export interface WorkspaceSettings {
  workspaceId: string;
  name: string;
  slug: string;
  vertical: string | null;
  environment: string | null;
  region: string | null;
  complianceMode: string | null;
}

export interface WorkspaceCustomFieldsPatch {
  vertical?: string | null;
  environment?: string;
  region?: string;
  complianceMode?: string;
}

// Reads/writes the `organization` table. The `name`/`slug`/`logo`/`metadata`
// columns are owned by better-auth's organization plugin and must be updated
// via `auth.api.updateOrganization` — NOT via this repo. This repo handles
// only the kuralle-specific additionalFields (vertical/environment/region/
// complianceMode).
export class WorkspaceRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  async getSettings(): Promise<WorkspaceSettings | null> {
    const rows = await this.db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        vertical: schema.organization.vertical,
        environment: schema.organization.environment,
        region: schema.organization.region,
        complianceMode: schema.organization.complianceMode,
      })
      .from(schema.organization)
      .where(eq(schema.organization.id, this.workspaceId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      workspaceId: row.id,
      name: row.name,
      slug: row.slug,
      vertical: row.vertical ?? null,
      environment: row.environment ?? null,
      region: row.region ?? null,
      complianceMode: row.complianceMode ?? null,
    };
  }

  async updateCustomFields(patch: WorkspaceCustomFieldsPatch): Promise<void> {
    const drizzlePatch: Partial<typeof schema.organization.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (patch.vertical !== undefined) drizzlePatch.vertical = patch.vertical;
    if (patch.environment !== undefined) drizzlePatch.environment = patch.environment;
    if (patch.region !== undefined) drizzlePatch.region = patch.region;
    if (patch.complianceMode !== undefined) drizzlePatch.complianceMode = patch.complianceMode;

    // Skip the UPDATE if no actual fields changed (only updatedAt).
    if (Object.keys(drizzlePatch).length === 1) return;

    await this.db
      .update(schema.organization)
      .set(drizzlePatch)
      .where(eq(schema.organization.id, this.workspaceId));
  }
}
