import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useOnboardingState } from "./onboarding";

const BASE_URL = "http://localhost:3000/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useOnboardingState", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns state on happy path", async () => {
    const state = {
      workspaceId: "ws_test",
      currentStep: "vertical",
      completedAt: null,
      vertical: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    server.use(
      http.post(`${BASE_URL}/onboarding/get`, () =>
        HttpResponse.json({ json: state }),
      ),
    );

    const { result } = renderHook(
      () => useOnboardingState({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.currentStep).toBe("vertical");
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/onboarding/get`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useOnboardingState({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
