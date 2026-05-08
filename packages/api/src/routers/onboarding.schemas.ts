import { z } from "zod";

export const onboardingStepSchema = z.enum([
  "vertical",
  "name",
  "phone",
  "done",
]);

export const onboardingStateSchema = z
  .object({
    workspaceId: z.string(),
    currentStep: z.string(),
    completedAt: z.date().nullable(),
    vertical: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
  })
  .strict();

export const onboardingCompleteOutputSchema = z
  .object({
    workspaceId: z.string(),
    organizationUpdated: z.literal(true),
  })
  .strict();
