import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";

import { useWorkspace, WorkspaceProvider, VERTICAL_LABEL } from "@/contexts/workspace";

function Probe() {
  const { workspace, setVertical, setEnvironment } = useWorkspace();
  return (
    <div>
      <span data-testid="vertical">{workspace.vertical}</span>
      <span data-testid="env">{workspace.environment}</span>
      <button onClick={() => setVertical("education")}>edu</button>
      <button onClick={() => setEnvironment("staging")}>staging</button>
    </div>
  );
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("seeds the default workspace and exposes mutators", () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId("vertical").textContent).toBe("home-services");
    expect(screen.getByTestId("env").textContent).toBe("production");
  });

  it("persists vertical changes to localStorage", () => {
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );
    act(() => screen.getByText("edu").click());
    expect(screen.getByTestId("vertical").textContent).toBe("education");
    expect(JSON.parse(window.localStorage.getItem("vokari.workspace.v1")!).vertical).toBe(
      "education",
    );
  });

  it("exports a label table with all three verticals", () => {
    expect(Object.keys(VERTICAL_LABEL)).toHaveLength(3);
  });
});
