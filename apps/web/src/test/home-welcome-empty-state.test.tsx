import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";

import { Route as HomeRouteDef } from "@/routes/_app.home";

const HomeComponent = HomeRouteDef.options.component;

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: {
          id: "u_home_welcome",
          name: "Test",
          createdAt: new Date(Date.now() - 2_000).toISOString(),
        },
        session: { activeOrganizationId: "ws_home" },
      },
      isPending: false,
      error: null,
    }),
  },
}));

vi.mock("@/contexts/workspace", () => ({
  useActiveWorkspaceId: () => "ws_home",
}));

vi.mock("@/hooks/api/workspace", () => ({
  useWorkspaceSettings: () => ({ data: { name: "Test Org" } }),
}));

vi.mock("@/hooks/api/compliance", () => ({
  useCompliancePosture: () => ({
    data: {
      hipaa: "inactive",
      ferpa: "inactive",
      tcpa: "active",
      euAiAct: "action-required",
    },
  }),
}));

vi.mock("@/hooks/api/health", () => ({
  useHealthCheck: () => ({ isLoading: false, isError: false }),
}));

vi.mock("@/hooks/api/home", () => ({
  useDashboard: () => ({
    data: { liveCalls: 0, todayCalls: 0, weeklyTrend: { count: 0, deltaPct: null } },
    isPending: false,
  }),
}));

vi.mock("@/hooks/api/conversations", () => ({
  useConversations: () => ({
    data: { items: [] },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/api/agents", () => ({
  useAgents: () => ({ data: { items: [] } }),
}));

describe("Home empty state + welcome modal", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    window.localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("shows welcome modal on first run while empty-state branch is active", async () => {
    const root = createRootRoute({
      component: HomeComponent,
    });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/don.*t have an agent yet/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Welcome to Kuralle.")).toBeInTheDocument();
    });
  });
});
