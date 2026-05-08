import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useWidgetConfig } from "./widget";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useWidgetConfig", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns config on happy path", async () => {
    const config = {
      workspaceId: "ws_test",
      modality: "both",
      theme: null,
      strings: null,
      vars: null,
      feedbackEnabled: true,
      termsUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    server.use(
      http.post(`${BASE_URL}/widget/get`, () =>
        HttpResponse.json({ json: config }),
      ),
    );

    const { result } = renderHook(
      () => useWidgetConfig({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.modality).toBe("both");
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/widget/get`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useWidgetConfig({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
