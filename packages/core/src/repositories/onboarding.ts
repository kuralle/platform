import { eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";

export type OnboardingStep = "vertical" | "name" | "phone" | "done";

export interface OnboardingState {
  workspaceId: string;
  currentStep: string;
  completedAt: Date | null;
  vertical: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

function toDomain(row: typeof schema.onboardingStates.$inferSelect): OnboardingState {
  return {
    workspaceId: row.workspaceId,
    currentStep: row.currentStep,
    completedAt: row.completedAt,
    vertical: row.vertical,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class OnboardingRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  async getState(): Promise<OnboardingState | null> {
    const rows = await this.db
      .select()
      .from(schema.onboardingStates)
      .where(eq(schema.onboardingStates.workspaceId, this.workspaceId))
      .limit(1);
    if (rows.length === 0) return null;
    return toDomain(rows[0]!);
  }

  async advanceStep(step: OnboardingStep): Promise<OnboardingState> {
    const now = new Date();
    const existing = await this.getState();
    if (existing) {
      const [row] = await this.db
        .update(schema.onboardingStates)
        .set({
          currentStep: step,
          updatedAt: now,
          ...(step === "done" ? { completedAt: now } : {}),
        })
        .where(eq(schema.onboardingStates.workspaceId, this.workspaceId))
        .returning();
      if (!row) throw new Error("OnboardingRepository.advanceStep: update returned no row");
      return toDomain(row);
    }

    const [row] = await this.db
      .insert(schema.onboardingStates)
      .values({
        workspaceId: this.workspaceId,
        currentStep: step,
        completedAt: step === "done" ? now : null,
        updatedAt: now,
      })
      .returning();

    if (!row) throw new Error("OnboardingRepository.advanceStep: insert returned no row");
    return toDomain(row);
  }

  async markComplete(vertical: string): Promise<OnboardingState> {
    const now = new Date();
    const existing = await this.getState();
    if (existing) {
      const [row] = await this.db
        .update(schema.onboardingStates)
        .set({
          currentStep: "done",
          completedAt: now,
          vertical,
          updatedAt: now,
        })
        .where(eq(schema.onboardingStates.workspaceId, this.workspaceId))
        .returning();
      if (!row) throw new Error("OnboardingRepository.markComplete: update returned no row");
      return toDomain(row);
    }

    const [row] = await this.db
      .insert(schema.onboardingStates)
      .values({
        workspaceId: this.workspaceId,
        currentStep: "done",
        completedAt: now,
        vertical,
        updatedAt: now,
      })
      .returning();

    if (!row) throw new Error("OnboardingRepository.markComplete: insert returned no row");
    return toDomain(row);
  }
}
