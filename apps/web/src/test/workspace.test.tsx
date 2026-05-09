import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useWorkspace, WorkspaceProvider, VERTICAL_LABEL } from "@/contexts/workspace";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { session: { activeOrganizationId: "ws_test" }, user: { name: "Test" } }, isPending: false, error: null }),
  },
}));

vi.mock("@/providers/api-provider", () => ({
  $api: {
    workspace: {
      get: {
        queryOptions: () => ({
          queryKey: ["workspace"],
          queryFn: () => Promise.resolve({ name: "Test Org" }),
        }),
      },
    },
  },
}));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function Probe() {
  const { workspace, setVertical, setEnvironment } = useWorkspace();
  return (
    <div>
      <span data-testid="vertical">{workspace.vertical}</span>
      <span data-testid="env">{workspace.environment}</span>
      <span data-testid="ws-id">{workspace.id}</span>
      <button onClick={() => setVertical("education")}>edu</button>
      <button onClick={() => setEnvironment("staging")}>staging</button>
    </div>
  );
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("seeds default prefs and reads workspace id from session", () => {
    render(
      <Wrapper>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </Wrapper>,
    );
    expect(screen.getByTestId("vertical").textContent).toBe("home-services");
    expect(screen.getByTestId("env").textContent).toBe("production");
    expect(screen.getByTestId("ws-id").textContent).toBe("ws_test");
  });

  it("persists vertical changes to localStorage", () => {
    render(
      <Wrapper>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </Wrapper>,
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
