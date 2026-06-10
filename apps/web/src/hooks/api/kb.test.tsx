import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useKb } from "./kb";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useKb", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns empty items list on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/kb/list`, () =>
        HttpResponse.json({
          json: { items: [], cursor: null },
        }),
      ),
    );

    const { result } = renderHook(
      () => useKb({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.cursor).toBeNull();
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/kb/list`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useKb({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
