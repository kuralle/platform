import { ORPCError } from "@orpc/server";
import {
  requireWorkspaceMembership,
  WorkspaceAccessDeniedError,
} from "@kuralle/core";
import type { Context } from "./context";

export async function assertWorkspaceMember(
  context: Context,
  workspaceId: string,
): Promise<void> {
  const userId = context.session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  try {
    await requireWorkspaceMembership(context.db, workspaceId, userId);
  } catch (e) {
    if (e instanceof WorkspaceAccessDeniedError) {
      throw new ORPCError("FORBIDDEN", { message: e.message });
    }
    throw e;
  }
}
