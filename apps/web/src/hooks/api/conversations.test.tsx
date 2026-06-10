import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import {
  useConversation,
  useConversations,
  useConversationLive,
} from "./conversations";

const BASE_URL = "http://localhost:8787/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useConversations", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns empty items list on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/conversations/list`, () =>
        HttpResponse.json({
          json: { items: [], cursor: null },
        }),
      ),
    );

    const { result } = renderHook(
      () => useConversations({ workspaceId: "ws_test" }),
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
      http.post(`${BASE_URL}/conversations/list`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useConversations({ workspaceId: "ws_test" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useConversation", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("returns full detail bundle on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/conversations/get`, () =>
        HttpResponse.json({
          json: {
            conversation: {
              id: "cv_1",
              workspaceId: "ws_test",
              agentId: null,
              agentVersionId: null,
              bundleHash: null,
              channelKind: "whatsapp",
              channelEndpointId: null,
              threadKey: "whatsapp:1",
              direction: "inbound",
              participantId: null,
              participantName: "Demo",
              startedAt: new Date("2026-01-01T00:00:00.000Z"),
              endedAt: null,
              durationSec: null,
              outcome: null,
              recordingStorageKey: null,
              costUsd: null,
              evalsPassed: 0,
              evalsTotal: 0,
              topics: [],
              metadata: null,
              deploymentId: null,
              turnsArchiveKey: null,
              guardrailEventsArchiveKey: null,
            },
            turns: [],
            toolCalls: [],
            extractedFields: [],
            evals: [],
          },
        }),
      ),
    );

    const { result } = renderHook(
      () =>
        useConversation({
          workspaceId: "ws_test",
          conversationId: "cv_1",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.conversation.id).toBe("cv_1");
    expect(result.current.data?.turns).toEqual([]);
    expect(result.current.data?.toolCalls).toEqual([]);
  });

  it("surfaces error on server failure", async () => {
    server.use(
      http.post(`${BASE_URL}/conversations/get`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () =>
        useConversation({
          workspaceId: "ws_test",
          conversationId: "cv_1",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useConversationLive", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("merges polling items with existing turns", async () => {
    server.use(
      http.post(`${BASE_URL}/conversations/live`, () =>
        HttpResponse.json({
          json: {
            kind: "polling",
            sinceSequence: 1,
            nextSequence: 2,
            items: [
              {
                id: "ct_2",
                conversationId: "cv_1",
                ordinal: 2,
                speaker: "agent",
                text: "hello back",
                messageId: null,
                mediaPayload: null,
                deliveryStatus: null,
                statusUpdatedAt: null,
                timestampSec: 1,
                evalVerdict: null,
                workflowNodeId: null,
                tokensInput: null,
                tokensOutput: null,
                latencyMs: null,
                contextUtilization: null,
                modelUsed: null,
                createdAt: new Date("2026-01-01T00:00:01.000Z"),
              },
            ],
          },
        }),
      ),
    );

    const { result } = renderHook(
      () =>
        useConversationLive({
          workspaceId: "ws_test",
          conversationId: "cv_1",
          initialTurns: [
            {
              id: "ct_1",
              conversationId: "cv_1",
              ordinal: 1,
              speaker: "caller",
            },
          ],
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.turns.map((turn) => turn.id)).toEqual(["ct_1", "ct_2"]);
    expect(result.current.nextSequence).toBe(2);
  });
});
