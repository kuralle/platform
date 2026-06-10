import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Route as AgentsListRouteDef } from "@/routes/_app.agents.index";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:8787/rpc";
const AgentsListRoute = AgentsListRouteDef.options.component!;

const navigate = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/contexts/workspace", () => ({
  useActiveWorkspaceId: () => "ws_test",
}));

vi.mock("@/components/empty-state", () => ({
  EmptyState: ({
    primaryAction,
  }: {
    primaryAction: { label: string; onClick?: () => void };
  }) => (
    <button type="button" onClick={primaryAction.onClick}>
      {primaryAction.label}
    </button>
  ),
}));

describe("Agents list create flow", () => {
  let queryClient: QueryClient;

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    server.resetHandlers();
    navigate.mockClear();
  });
  afterAll(() => server.close());

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    server.use(
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({ json: { items: [], cursor: null } }),
      ),
      http.post(`${BASE_URL}/agents/create`, async ({ request }) => {
        const body = (await request.json()) as { json: { workspaceId: string } };
        expect(body.json.workspaceId).toBe("ws_test");
        return HttpResponse.json({ json: { agentId: "ag_created01" } });
      }),
    );
  });

  it("calls agents.create with active workspace and navigates to behavior editor", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <AgentsListRoute />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /new agent/i }));

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/agents/$agentId/behavior",
        params: { agentId: "ag_created01" },
      });
    });
  });
});
