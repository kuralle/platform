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
