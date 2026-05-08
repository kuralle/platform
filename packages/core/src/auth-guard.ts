import { and, eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import { WorkspaceAccessDeniedError } from "./errors.js";
import type { RepoDb } from "./repositories/types.js";

export async function requireWorkspaceMembership(
  db: RepoDb,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, workspaceId),
        eq(schema.member.userId, userId),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new WorkspaceAccessDeniedError();
  }
}
