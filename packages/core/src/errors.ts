export class AppendOnlyViolation extends Error {
  public readonly name = "AppendOnlyViolation";

  constructor(message = "agent_versions rows are append-only and cannot be updated") {
    super(message);
  }
}

export class WorkspaceScopeViolation extends Error {
  public readonly name = "WorkspaceScopeViolation";

  constructor(resource: string, id: string, expectedWorkspace: string, actualWorkspace: string) {
    super(
      `${resource} ${id} belongs to workspace ${actualWorkspace}, not ${expectedWorkspace}`,
    );
  }
}

export class WorkspaceAccessDeniedError extends Error {
  public readonly name = "WorkspaceAccessDeniedError";

  constructor(message = "Caller is not a member of this workspace") {
    super(message);
  }
}

export type WorkspaceRole = "viewer" | "member" | "admin" | "owner";

export class WorkspaceRoleDeniedError extends Error {
  public readonly name = "WorkspaceRoleDeniedError";
  public readonly requiredRole: WorkspaceRole;

  constructor(requiredRole: WorkspaceRole) {
    super(`Requires workspace role: ${requiredRole}`);
    this.requiredRole = requiredRole;
  }
}
