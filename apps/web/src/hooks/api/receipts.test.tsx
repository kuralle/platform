import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useMonthlyReceipt } from "./receipts";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useMonthlyReceipt", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns report on happy path", async () => {
    const report = {
      workspaceId: "ws_test",
      year: 2026,
      month: 4,
      totalCalls: 312,
      totalCostUsd: 390,
      byKind: [],
      byAgent: [],
    };
    server.use(
      http.post(`${BASE_URL}/receipts/getMonthly`, () =>
        HttpResponse.json({ json: report }),
      ),
    );

    const { result } = renderHook(
      () => useMonthlyReceipt({ workspaceId: "ws_test", year: 2026, month: 4 }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.totalCalls).toBe(312);
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/receipts/getMonthly`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useMonthlyReceipt({ workspaceId: "ws_test", year: 2026, month: 4 }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
