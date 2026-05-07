import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";

import { server } from "@/test/msw-server";
import { useAgents, useAgent, useAgentPublish, useAgentAutoSave, useAgentHistory } from "./agents";

const BASE_URL = "http://localhost:3000/rpc";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("useAgents", () => {
  it("returns empty items list on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({
          json: { items: [], cursor: null },
        }),
      ),
    );

    const { result } = renderHook(
      () => useAgents({ workspaceId: "demo-workspace" }),
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
      http.post(`${BASE_URL}/agents/list`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(
      () => useAgents({ workspaceId: "demo-workspace" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe("useAgent", () => {
  it("returns agent with active version on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/get`, () =>
        HttpResponse.json({
          json: {
            agent: {
              id: "ag_a00", workspaceId: "ws_1", status: "live",
              activeVersionId: "av_001", authorUserId: null,
              metadata: null, createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: null, deletedAt: null,
            },
            activeVersion: {
              id: "av_001", agentId: "ag_a00", versionNumber: 1,
              versionKind: "publish", parentVersionId: null,
              changeSummary: null, changedFields: [],
              publishedByUserId: null, publishedAt: "2026-01-01T00:00:00.000Z",
              snapshot: { name: "Test Agent", description: "", instructions: "Be helpful" },
              bundleStorageKey: null, bundleHash: null,
              bundleStatus: null, bundleSizeBytes: null,
              builderVersion: null, builtAt: null,
            },
          },
        }),
      ),
    );

    const { result } = renderHook(
      () => useAgent({ workspaceId: "demo-workspace", agentId: "ag_a00" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.agent.id).toBe("ag_a00");
    expect(result.current.data?.activeVersion?.id).toBe("av_001");
  });
});

describe("useAgentPublish", () => {
  it("publishes and returns version info on success", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/publish`, () =>
        HttpResponse.json({
          json: { versionId: "av_new", versionNumber: 2, activeVersionId: "av_new" },
        }),
      ),
    );

    const { result } = renderHook(() => useAgentPublish(), { wrapper });

    await act(async () => {
      result.current.mutate({
        workspaceId: "ws_1",
        agentId: "ag_a00",
        ir: {
          name: "Test", description: "", instructions: "Be helpful",
          model: { provider: "openai", name: "gpt-4o" },
          voiceConfig: { pipelineMode: "stt-llm-tts", ttsModel: "cartesia-sonic-3", ttsVoiceId: "v_aurora", sttModel: "deepgram-nova-3" },
          guardrailGraph: { nodes: [], edges: [] },
          complianceConfig: { retentionDays: 90, redactionPatterns: [], disclosureScript: "" },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.versionId).toBe("av_new");
    expect(result.current.data?.versionNumber).toBe(2);
  });
});

describe("useAgentAutoSave", () => {
  it("auto-saves and returns version info on success", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/autoSave`, () =>
        HttpResponse.json({
          json: { versionId: "av_auto", versionNumber: 3 },
        }),
      ),
    );

    const { result } = renderHook(() => useAgentAutoSave(), { wrapper });

    await act(async () => {
      result.current.mutate({
        workspaceId: "ws_1",
        agentId: "ag_a00",
        ir: {
          name: "Test", description: "", instructions: "Updated",
          model: { provider: "openai", name: "gpt-4o" },
          voiceConfig: { pipelineMode: "stt-llm-tts", ttsModel: "cartesia-sonic-3", ttsVoiceId: "v_aurora", sttModel: "deepgram-nova-3" },
          guardrailGraph: { nodes: [], edges: [] },
          complianceConfig: { retentionDays: 90, redactionPatterns: [], disclosureScript: "" },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.versionId).toBe("av_auto");
  });
});

describe("useAgentHistory", () => {
  it("returns version history on happy path", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/history`, () =>
        HttpResponse.json({
          json: { items: [], cursor: null },
        }),
      ),
    );

    const { result } = renderHook(
      () => useAgentHistory({ workspaceId: "ws_1", agentId: "ag_a00" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.cursor).toBeNull();
  });
});
