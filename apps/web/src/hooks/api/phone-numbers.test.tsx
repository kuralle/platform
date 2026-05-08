import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { usePhoneNumbers } from "./phone-numbers";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePhoneNumbers", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns empty items list on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        HttpResponse.json({
          json: { items: [] },
        }),
      ),
    );

    const { result } = renderHook(
      () => usePhoneNumbers({ workspaceId: "demo-workspace" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([]);
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => usePhoneNumbers({ workspaceId: "demo-workspace" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
