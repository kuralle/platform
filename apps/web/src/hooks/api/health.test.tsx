import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockQueryOptions = vi.fn();

vi.mock("@/providers/api-provider", () => ({
  $api: {
    healthCheck: {
      queryOptions: (...args: unknown[]) => mockQueryOptions(...args),
    },
  },
  ApiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { useHealthCheck } from "./health";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useHealthCheck", () => {
  it("returns OK data on happy path", async () => {
    mockQueryOptions.mockReturnValue({
      queryKey: ["healthCheck"],
      queryFn: () => Promise.resolve("OK"),
    });

    const { result } = renderHook(() => useHealthCheck(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toBe("OK");
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("surfaces error on server failure", async () => {
    mockQueryOptions.mockReturnValue({
      queryKey: ["healthCheck"],
      queryFn: () => Promise.reject(new Error("Server error")),
    });

    const { result } = renderHook(() => useHealthCheck(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeDefined();
    });
  });
});
