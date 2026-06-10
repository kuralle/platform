import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import type { AgentIR } from "@kuralle/core";

import { Sheet, SheetContent } from "@kuralle/ui/components/sheet";

import { AgentTestDrawer } from "@/components/configure/agent-test-drawer";
import { EditorContext } from "@/contexts/editor";
import { server } from "@/test/msw-server";

const BASE_URL = "http://localhost:8787/rpc";

const SEED_IR: AgentIR = {
  name: "Drawer Agent",
  description: "",
  instructions: "Be helpful.",
  model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
    disclosureScript: "",
  },
  requestContextSchema: {},
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <EditorContext.Provider
        value={{
          state: { ir: SEED_IR, original: SEED_IR },
          dispatch: () => undefined,
          seeded: true,
        }}
      >
        {children}
      </EditorContext.Provider>
    </QueryClientProvider>
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AgentTestDrawer", () => {
  it("sends a message and renders the agent reply", async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${BASE_URL}/agents/testTurn`, async ({ request }) => {
        const body = (await request.json()) as {
          json: { input: string; agentId: string; workspaceId: string };
        };
        expect(body.json.workspaceId).toBe("ws_test");
        expect(body.json.agentId).toBe("ag_drawer");
        expect(body.json.input).toBe("Need a furnace tech");
        return HttpResponse.json({
          json: {
            reply: "I can help schedule a technician.",
            sessionId: "test_sess_01",
            toolCalls: [],
          },
        });
      }),
    );

    render(
      <Sheet open>
        <SheetContent>
          <AgentTestDrawer
            agentName="Drawer Agent"
            agentId="ag_drawer"
            workspaceId="ws_test"
          />
        </SheetContent>
      </Sheet>,
      { wrapper },
    );

    await user.type(screen.getByPlaceholderText("Type your reply…"), "Need a furnace tech");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("I can help schedule a technician.")).toBeInTheDocument();
    });
    expect(screen.getByText("Need a furnace tech")).toBeInTheDocument();
  });
});
