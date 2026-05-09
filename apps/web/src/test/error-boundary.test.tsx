import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { ErrorBoundaryFallback } from "@/components/error-boundary";

function Boom() {
  throw new Error("boundary-test-boom");
}

describe("ErrorBoundaryFallback", () => {
  it("renders fallback when a child throws, reload is focusable, home link navigates", async () => {
    const root = createRootRoute({
      component: () => <Outlet />,
    });

    const indexRoute = createRoute({
      getParentRoute: () => root,
      path: "/",
      component: Boom,
      errorComponent: ErrorBoundaryFallback,
    });

    const homeRoute = createRoute({
      getParentRoute: () => root,
      path: "home",
      component: () => <div>At home</div>,
    });

    const routeTree = root.addChildren([indexRoute, homeRoute]);
    const history = createMemoryHistory({ initialEntries: ["/"] });
    const router = createRouter({
      routeTree,
      history,
      defaultErrorComponent: ErrorBoundaryFallback,
    });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByText("Something went wrong on this page."),
    ).toBeInTheDocument();

    const reload = screen.getByRole("button", { name: /reload/i });
    expect(reload).not.toHaveAttribute("tabindex", "-1");
    reload.focus();
    expect(reload).toHaveFocus();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /go home/i }));

    expect(await screen.findByText("At home")).toBeInTheDocument();
  });
});
