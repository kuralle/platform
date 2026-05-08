import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useCompliancePosture } from "./compliance";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useCompliancePosture", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns posture on happy path", async () => {
    const posture = {
      workspaceId: "ws_test",
      hipaa: "inactive",
      ferpa: "inactive",
      tcpa: "active",
      euAiAct: null,
      evaluatedAt: null,
      details: null,
    };
    server.use(
      http.post(`${BASE_URL}/compliance/getPosture`, () =>
        HttpResponse.json({ json: posture }),
      ),
    );

    const { result } = renderHook(
      () => useCompliancePosture({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.tcpa).toBe("active");
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/compliance/getPosture`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useCompliancePosture({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
