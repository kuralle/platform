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
  useChannelStatus,
  useWebhookInfo,
  useBindAgent,
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
      () => useChannels({ workspaceId: "ws_test" }),
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
      () => useChannels({ workspaceId: "ws_test", kind: "whatsapp" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(receivedInput).toBeDefined();
    });
    expect(receivedInput).toMatchObject({
      json: { workspaceId: "ws_test", kind: "whatsapp" },
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
      () => useChannels({ workspaceId: "ws_test" }),
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
          workspaceId: "ws_test",
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
        workspaceId: "ws_test",
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
        workspaceId: "ws_test",
        connectionId: "chc_1",
        phoneNumberId: "111",
        agentId: "ag_1",
      });
      expect(res.endpointId).toBe("che_new");
    });
  });
});

describe("useChannelStatus", () => {
  it("returns deploy status for an endpoint", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/status`, () =>
        HttpResponse.json({
          json: {
            receivingTraffic: true,
            lastInboundAt: "2026-06-10T12:00:00.000Z",
            boundAgent: {
              id: "ag_1",
              name: "Support",
              activeVersionNumber: 1,
            },
          },
        }),
      ),
    );

    const { result } = renderHook(
      () =>
        useChannelStatus({
          workspaceId: "ws_test",
          endpointId: "che_1",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.receivingTraffic).toBe(true);
    expect(result.current.data?.boundAgent?.name).toBe("Support");
  });
});

describe("useWebhookInfo", () => {
  it("returns webhook setup info", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/webhookInfo`, () =>
        HttpResponse.json({
          json: {
            url: "http://localhost:3000/webhooks/meta",
            verifyTokenHint: "ab••••yz",
            instructions: "Set callback URL in Meta.",
          },
        }),
      ),
    );

    const { result } = renderHook(
      () => useWebhookInfo({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.url).toContain("/webhooks/meta");
  });
});

describe("useBindAgent", () => {
  it("binds an agent to an endpoint", async () => {
    server.use(
      http.post(`${BASE_URL}/channels/bindAgent`, () =>
        HttpResponse.json({
          json: {
            endpointId: "che_1",
            agentId: "ag_2",
            agentVersionId: "av_2",
          },
        }),
      ),
    );

    const { result } = renderHook(() => useBindAgent(), { wrapper });

    await act(async () => {
      const res = await result.current.mutateAsync({
        workspaceId: "ws_test",
        endpointId: "che_1",
        agentId: "ag_2",
      });
      expect(res.agentId).toBe("ag_2");
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
        workspaceId: "ws_test",
        endpointId: "che_to_release",
      });
      expect(res.released).toBe(true);
      expect(res.connectionId).toBe("chc_known");
    });
  });
});
