import { z } from "zod";

export const cursorInputFields = {
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(50),
};

export const cursorInput = z.object(cursorInputFields);

export function cursorListOutput<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .object({
      items: z.array(itemSchema),
      cursor: z.string().nullable(),
    })
    .strict();
}
