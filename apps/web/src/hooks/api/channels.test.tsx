import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import {
  useChannels,
  useChannelEndpoints,
  useConnectMetaChannel,
  useAttachEndpoint,
  useDetachEndpoint,
} from "./channels";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("useChannels", () => {
  it("returns connection items on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/list`, () =>
        HttpResponse.json({ json: { items: [], cursor: null } }),
      ),
    );

    const { result } = renderHook(
      () => useChannels({ workspaceId: "demo-workspace" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.cursor).toBeNull();
  });

  it("passes kind filter to the server", async () => {
    let receivedInput: unknown = undefined;
    server.use(
      http.post(`${BASE_URL}/channels/list`, async ({ request }) => {
        receivedInput = await request.json();
        return HttpResponse.json({ json: { items: [], cursor: null } });
      }),
    );

    renderHook(
      () => useChannels({ workspaceId: "demo-workspace", kind: "whatsapp" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(receivedInput).toBeDefined();
    });
    expect(receivedInput).toMatchObject({
      json: { workspaceId: "demo-workspace", kind: "whatsapp" },
    });
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(
        `${BASE_URL}/channels/list`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const { result } = renderHook(
      () => useChannels({ workspaceId: "demo-workspace" }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useChannelEndpoints", () => {
  it("returns endpoint items scoped to a connection", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/endpoints/list`, () =>
        HttpResponse.json({ json: { items: [] } }),
      ),
    );

    const { result } = renderHook(
      () =>
        useChannelEndpoints({
          workspaceId: "demo-workspace",
          connectionId: "chc_1",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([]);
  });
});

describe("useConnectMetaChannel", () => {
  it("returns the connectionId on successful mutation", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/connect`, () =>
        HttpResponse.json({
          json: { connectionId: "chc_new", availablePhoneNumbers: [] },
        }),
      ),
    );

    const { result } = renderHook(() => useConnectMetaChannel(), { wrapper });

    await act(async () => {
      const res = await result.current.mutateAsync({
        workspaceId: "demo-workspace",
        provider: "meta-whatsapp-cloud",
        displayName: "Test",
      });
      expect(res.connectionId).toBe("chc_new");
    });
  });
});

describe("useAttachEndpoint", () => {
  it("returns the endpointId on successful mutation", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/endpoints/attach`, () =>
        HttpResponse.json({ json: { endpointId: "che_new" } }),
      ),
    );

    const { result } = renderHook(() => useAttachEndpoint(), { wrapper });

    await act(async () => {
      const res = await result.current.mutateAsync({
        workspaceId: "demo-workspace",
        connectionId: "chc_1",
        phoneNumberId: "111",
        agentId: "ag_1",
      });
      expect(res.endpointId).toBe("che_new");
    });
  });
});

describe("useDetachEndpoint", () => {
  it("uses the server-returned connectionId for invalidation (kimi-gate R1 fix)", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/endpoints/detach`, () =>
        HttpResponse.json({
          json: { released: true, connectionId: "chc_known" },
        }),
      ),
    );

    const { result } = renderHook(() => useDetachEndpoint(), { wrapper });

    await act(async () => {
      const res = await result.current.mutateAsync({
        workspaceId: "demo-workspace",
        endpointId: "che_to_release",
      });
      expect(res.released).toBe(true);
      expect(res.connectionId).toBe("chc_known");
    });
  });
});
