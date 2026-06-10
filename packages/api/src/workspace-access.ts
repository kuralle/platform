import { ORPCError } from "@orpc/server";
import {
  requireWorkspaceMembership,
  requireWorkspaceRole,
  WorkspaceAccessDeniedError,
  WorkspaceRoleDeniedError,
  type WorkspaceRole,
} from "@kuralle/core";
import type { Context } from "./context";

export type { WorkspaceRole };

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

export async function assertWorkspaceRole(
  context: Context,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<void> {
  const userId = context.session?.user?.id;
  if (!userId) {
    throw new ORPCError("UNAUTHORIZED");
  }
  try {
    await requireWorkspaceRole(context.db, workspaceId, userId, minRole);
  } catch (e) {
    if (e instanceof WorkspaceAccessDeniedError) {
      throw new ORPCError("FORBIDDEN", { message: e.message });
    }
    if (e instanceof WorkspaceRoleDeniedError) {
      throw new ORPCError("FORBIDDEN", {
        message: `Requires workspace role: ${e.requiredRole}`,
        data: { requiredRole: e.requiredRole },
      });
    }
    throw e;
  }
}
