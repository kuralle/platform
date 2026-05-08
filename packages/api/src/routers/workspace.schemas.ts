import { z } from "zod";

export const workspaceSettingsSchema = z
  .object({
    workspaceId: z.string(),
    name: z.string(),
    slug: z.string(),
    vertical: z.string().nullable(),
    environment: z.string().nullable(),
    region: z.string().nullable(),
    complianceMode: z.string().nullable(),
  })
  .strict();
