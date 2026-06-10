import { and, eq } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import {
  WorkspaceAccessDeniedError,
  WorkspaceRoleDeniedError,
  type WorkspaceRole,
} from "./errors.js";
import type { RepoDb } from "./repositories/types.js";

export type { WorkspaceRole };

const WORKSPACE_ROLES: WorkspaceRole[] = ["viewer", "member", "admin", "owner"];

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function roleSatisfies(
  actual: WorkspaceRole,
  required: WorkspaceRole,
): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export async function requireWorkspaceMembership(
  db: RepoDb,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await getWorkspaceMemberRole(db, workspaceId, userId);
}

export async function getWorkspaceMemberRole(
  db: RepoDb,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole> {
  const rows = await db
    .select({ role: schema.member.role })
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

  const role = rows[0]!.role as WorkspaceRole;
  if (!WORKSPACE_ROLES.includes(role)) {
    return "member";
  }
  return role;
}

export async function requireWorkspaceRole(
  db: RepoDb,
  workspaceId: string,
  userId: string,
  minRole: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getWorkspaceMemberRole(db, workspaceId, userId);
  if (!roleSatisfies(role, minRole)) {
    throw new WorkspaceRoleDeniedError(minRole);
  }
  return role;
}
