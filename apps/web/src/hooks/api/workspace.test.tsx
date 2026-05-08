import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useWorkspaceSettings } from "./workspace";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useWorkspaceSettings", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns settings on happy path", async () => {
    const settings = {
      workspaceId: "ws_test",
      name: "Test Workspace",
      slug: "test-workspace",
      vertical: "home-services",
      environment: "production",
      region: "us-east-1",
      complianceMode: null,
    };
    server.use(
      http.post(`${BASE_URL}/workspace/get`, () =>
        HttpResponse.json({ json: settings }),
      ),
    );

    const { result } = renderHook(
      () => useWorkspaceSettings({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.name).toBe("Test Workspace");
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/workspace/get`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useWorkspaceSettings({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
