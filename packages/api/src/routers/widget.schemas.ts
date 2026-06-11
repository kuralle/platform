import { z } from "zod";

export const widgetConfigSchema = z
  .object({
    workspaceId: z.string(),
    modality: z.string(),
    theme: z.unknown().nullable(),
    strings: z.unknown().nullable(),
    vars: z.unknown().nullable(),
    feedbackEnabled: z.boolean().nullable(),
    termsUrl: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    embedKey: z.string().nullable(),
    serverUrl: z.string(),
  })
  .strict();

export const widgetEnableOutputSchema = z
  .object({
    embedKey: z.string(),
    endpointId: z.string(),
  })
  .strict();
