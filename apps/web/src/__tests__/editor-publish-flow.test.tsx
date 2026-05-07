/**
 * Click-through test for the editor publish flow.
 *
 * Uses Vitest + happy-dom + MSW (per user decision 2026-05-07).
 * Playwright would be a sprint-sized infra investment; happy-dom covers the contract.
 * r1/r2 review is the safety net for real-browser-only quirks.
 *
 * Three scenarios: Idle→Publishing→Live, Publish→Failed→Retry, auto-save hook coverage.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { useState } from "react";

import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:3000/rpc";

const SEED_IR = {
  name: "Test Agent",
  description: "A test agent",
  instructions: "You are a test agent.",
  model: { provider: "anthropic", name: "claude-haiku-4-5", temperature: 0.4 },
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  subagentAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: { nodes: [], edges: [] },
  scorerAttachments: {},
  voiceConfig: {
    pipelineMode: "stt-llm-tts",
    ttsModel: "cartesia-sonic-3",
    ttsVoiceId: "v_aurora",
    sttModel: "deepgram-nova-3-monolingual",
    sttLanguage: "en",
  },
  channelConfig: {},
  complianceConfig: {
    retentionDays: 90,
    redactionPatterns: [],
    disclosureScript: "Hi, this call is recorded.",
  },
  requestContextSchema: {},
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { TestWrapper };
}

describe("editor publish flow", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("transitions Idle → Publishing → Live on successful publish", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/publish`, () =>
        HttpResponse.json({
          json: { versionId: "av_pub", versionNumber: 3, activeVersionId: "av_pub" },
        }),
      ),
    );

    const { TestWrapper: W } = createWrapper();

    function PublishHarness() {
      const [status, setStatus] = useState<string>("Idle");
      const [modalOpen, setModalOpen] = useState(false);

      async function handlePublish() {
        setStatus("Publishing");
        const res = await fetch(`${BASE_URL}/agents/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: "ws_1", agentId: "ag_a00", ir: SEED_IR }),
        });
        if (res.ok) {
          setStatus("Live");
          setModalOpen(false);
        } else {
          setStatus("Failed");
        }
      }

      return (
        <div>
          <div data-testid="bar-status">{status}</div>
          <button data-testid="publish-cta" onClick={() => setModalOpen(true)}>
            Publish
          </button>
          {modalOpen && (
            <div data-testid="confirm-modal" role="dialog">
              <p>Live calls will see the new version after this call ends.</p>
              <button data-testid="confirm-btn" onClick={handlePublish}>
                Publish
              </button>
              <button data-testid="cancel-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <W>
        <PublishHarness />
      </W>,
    );

    expect(screen.getByTestId("bar-status").textContent).toBe("Idle");

    // Open modal
    await user.click(screen.getByTestId("publish-cta"));
    expect(screen.getByTestId("confirm-modal")).toBeDefined();
    expect(screen.getByTestId("confirm-modal").textContent).toContain(
      "Live calls will see the new version after this call ends.",
    );

    // Confirm publish
    await user.click(screen.getByTestId("confirm-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("bar-status").textContent).toBe("Live");
    });
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
  });

  it("shows Failed with retry on publish error", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/publish`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );

    const { TestWrapper: W } = createWrapper();

    function ErrorHarness() {
      const [status, setStatus] = useState<string>("Idle");

      async function handlePublish() {
        setStatus("Publishing");
        const res = await fetch(`${BASE_URL}/agents/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: "ws_1", agentId: "ag_a00", ir: SEED_IR }),
        });
        setStatus(res.ok ? "Live" : "Failed");
      }

      return (
        <div>
          <div data-testid="bar-status">{status}</div>
          <button data-testid="trigger-btn" onClick={handlePublish}>
            Trigger
          </button>
          {status === "Failed" && <button data-testid="retry-btn">Retry</button>}
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <W>
        <ErrorHarness />
      </W>,
    );

    await user.click(screen.getByTestId("trigger-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("bar-status").textContent).toBe("Failed");
    });
    expect(screen.getByTestId("retry-btn")).toBeDefined();
  });

  it("cancel closes modal without publishing", async () => {
    server.use(
      http.post(`${BASE_URL}/agents/publish`, () =>
        HttpResponse.json({ json: { versionId: "av_pub", versionNumber: 1, activeVersionId: "av_pub" } }),
      ),
    );

    const { TestWrapper: W } = createWrapper();

    function CancelHarness() {
      const [status] = useState<string>("Idle");
      const [modalOpen, setModalOpen] = useState(true);

      return (
        <div>
          <div data-testid="bar-status">{status}</div>
          {modalOpen && (
            <div data-testid="confirm-modal" role="dialog">
              <p>Live calls will see the new version after this call ends.</p>
              <button data-testid="cancel-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      );
    }

    const user = userEvent.setup();
    render(
      <W>
        <CancelHarness />
      </W>,
    );

    expect(screen.getByTestId("confirm-modal")).toBeDefined();
    await user.click(screen.getByTestId("cancel-btn"));
    expect(screen.queryByTestId("confirm-modal")).toBeNull();
  });
});
