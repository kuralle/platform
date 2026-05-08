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

  // Atomically patches organization.vertical AND upserts onboarding_states
  // to step=done with the given vertical. Both writes inside one transaction
  // so an onboarding flow can't end up with the org's vertical updated but
  // the onboarding state still showing in-flight (or vice versa).
  async markComplete(vertical: string): Promise<OnboardingState> {
    const now = new Date();
    let result: OnboardingState | undefined;
    const wsId = this.workspaceId;
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.organization)
        .set({ vertical, updatedAt: now })
        .where(eq(schema.organization.id, wsId));

      const [existing] = await tx
        .select()
        .from(schema.onboardingStates)
        .where(eq(schema.onboardingStates.workspaceId, wsId))
        .limit(1);

      if (existing) {
        const [row] = await tx
          .update(schema.onboardingStates)
          .set({
            currentStep: "done",
            completedAt: now,
            vertical,
            updatedAt: now,
          })
          .where(eq(schema.onboardingStates.workspaceId, wsId))
          .returning();
        if (!row) throw new Error("OnboardingRepository.markComplete: update returned no row");
        result = toDomain(row);
      } else {
        const [row] = await tx
          .insert(schema.onboardingStates)
          .values({
            workspaceId: wsId,
            currentStep: "done",
            completedAt: now,
            vertical,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new Error("OnboardingRepository.markComplete: insert returned no row");
        result = toDomain(row);
      }
    });
    if (!result) throw new Error("OnboardingRepository.markComplete: transaction yielded no result");
    return result;
  }
}
