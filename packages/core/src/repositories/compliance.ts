import { eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";

export interface WorkspaceCompliancePosture {
  workspaceId: string;
  hipaa: string | null;
  ferpa: string | null;
  tcpa: string | null;
  euAiAct: string | null;
  evaluatedAt: Date | null;
  details: unknown;
}

export interface CompliancePostureUpsert {
  workspaceId?: string;
  hipaa?: string | null;
  ferpa?: string | null;
  tcpa?: string | null;
  euAiAct?: string | null;
  details?: unknown;
}

function toDomain(
  row: typeof schema.workspaceCompliancePosture.$inferSelect,
): WorkspaceCompliancePosture {
  return {
    workspaceId: row.workspaceId,
    hipaa: row.hipaa,
    ferpa: row.ferpa,
    tcpa: row.tcpa,
    euAiAct: row.euAiAct,
    evaluatedAt: row.evaluatedAt,
    details: row.details,
  };
}

export class ComplianceRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  async getPosture(): Promise<WorkspaceCompliancePosture | null> {
    const rows = await this.db
      .select()
      .from(schema.workspaceCompliancePosture)
      .where(
        eq(schema.workspaceCompliancePosture.workspaceId, this.workspaceId),
      )
      .limit(1);
    if (rows.length === 0) return null;
    return toDomain(rows[0]!);
  }

  async upsertPosture(
    patch: CompliancePostureUpsert,
  ): Promise<WorkspaceCompliancePosture> {
    const existing = await this.getPosture();
    const now = new Date();
    const merged = {
      hipaa: patch.hipaa !== undefined ? patch.hipaa : existing?.hipaa ?? null,
      ferpa: patch.ferpa !== undefined ? patch.ferpa : existing?.ferpa ?? null,
      tcpa: patch.tcpa !== undefined ? patch.tcpa : existing?.tcpa ?? null,
      euAiAct: patch.euAiAct !== undefined ? patch.euAiAct : existing?.euAiAct ?? null,
      details: patch.details !== undefined ? patch.details : existing?.details ?? null,
    };

    if (existing) {
      const [row] = await this.db
        .update(schema.workspaceCompliancePosture)
        .set({
          ...merged,
          evaluatedAt: now,
        })
        .where(
          eq(schema.workspaceCompliancePosture.workspaceId, this.workspaceId),
        )
        .returning();
      if (!row) throw new Error("ComplianceRepository.upsertPosture: update returned no row");
      return toDomain(row);
    }

    const [row] = await this.db
      .insert(schema.workspaceCompliancePosture)
      .values({
        workspaceId: this.workspaceId,
        ...merged,
        evaluatedAt: now,
      })
      .returning();

    if (!row) throw new Error("ComplianceRepository.upsertPosture: insert returned no row");
    return toDomain(row);
  }
}
