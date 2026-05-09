import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EmptyState } from "./empty-state";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        title="No agents yet"
        description="Create your first agent."
        primaryAction={{ label: "New agent", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first agent.")).toBeInTheDocument();
  });

  it("renders primary action with onClick", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        primaryAction={{ label: "Do something", onClick }}
      />,
    );
    fireEvent.click(screen.getByText("Do something"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders primary action with `to` as a Link", () => {
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        primaryAction={{ label: "Go there", to: "/agents" }}
      />,
    );
    const link = screen.getByText("Go there").closest("a");
    expect(link).toHaveAttribute("href", "/agents");
  });

  it("renders primary action with `href` as an external anchor", () => {
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        primaryAction={{ label: "External", href: "https://example.com" }}
      />,
    );
    const anchor = screen.getByText("External").closest("a");
    expect(anchor).toHaveAttribute("href", "https://example.com");
    expect(anchor).toHaveAttribute("target", "_blank");
  });

  it("renders secondary action when provided", () => {
    render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        primaryAction={{ label: "Primary", onClick: vi.fn() }}
        secondaryAction={{ label: "Secondary", to: "/templates" }}
      />,
    );
    expect(screen.getByText("Secondary")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    const { container } = render(
      <EmptyState
        title="Empty"
        description="Nothing here"
        primaryAction={{ label: "Go", onClick: vi.fn() }}
        icon={<svg data-testid="test-icon" />}
      />,
    );
    expect(container.querySelector("[data-testid='test-icon']")).toBeInTheDocument();
  });
});
