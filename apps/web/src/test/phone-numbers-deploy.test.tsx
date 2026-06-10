import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/msw-server";
import { PhoneNumbersRoute } from "@/routes/_app.phone-numbers";

const BASE_URL = "http://localhost:8787/rpc";

vi.mock("@/contexts/workspace", () => ({
  useActiveWorkspaceId: () => "ws_test",
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("phone numbers deploy surface", () => {
  it("renders deploy status and agent binding select; bind updates", async () => {
    const user = userEvent.setup();
    let boundAgentId = "ag_one";

    server.use(
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        HttpResponse.json({
          json: {
            items: [
              {
                id: "che_1",
                workspaceId: "ws_test",
                connectionId: "chc_1",
                channelKind: "whatsapp",
                identifier: "15551234567",
                displayName: "+1 555 123 4567",
                attachedAgentId: boundAgentId,
                attachedAgentVersionId: "av_1",
                routingRulesId: null,
                publicWebhookUrl: "http://localhost:3000/webhooks/meta",
                publicStreamUrl: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                releasedAt: null,
              },
            ],
          },
        }),
      ),
      http.post(`${BASE_URL}/channels/status`, () =>
        HttpResponse.json({
          json: {
            receivingTraffic: false,
            lastInboundAt: null,
            boundAgent: {
              id: boundAgentId,
              name: "Support Agent",
              activeVersionNumber: 2,
            },
          },
        }),
      ),
      http.post(`${BASE_URL}/channels/webhookInfo`, () =>
        HttpResponse.json({
          json: {
            url: "http://localhost:3000/webhooks/meta",
            verifyTokenHint: "ve••••en",
            instructions: "Configure Meta webhook.",
          },
        }),
      ),
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({
          json: {
            items: [
              {
                id: "ag_one",
                workspaceId: "ws_test",
                status: "published",
                activeVersionId: "av_1",
                authorUserId: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                updatedAt: null,
                deletedAt: null,
              },
              {
                id: "ag_two",
                workspaceId: "ws_test",
                status: "published",
                activeVersionId: "av_2",
                authorUserId: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                updatedAt: null,
                deletedAt: null,
              },
            ],
            cursor: null,
          },
        }),
      ),
      http.post(`${BASE_URL}/channels/bindAgent`, async ({ request }) => {
        const body = (await request.json()) as {
          json: { agentId: string; endpointId: string };
        };
        boundAgentId = body.json.agentId;
        return HttpResponse.json({
          json: {
            endpointId: body.json.endpointId,
            agentId: body.json.agentId,
            agentVersionId: "av_2",
          },
        });
      }),
    );

    render(<PhoneNumbersRoute />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Awaiting webhook")).toBeInTheDocument();
    });
    expect(screen.getByText("+1 555 123 4567")).toBeInTheDocument();

    await user.click(screen.getByText("Support Agent"));
    await user.click(screen.getByRole("option", { name: "ag_two" }));

    await waitFor(() => {
      expect(boundAgentId).toBe("ag_two");
    });
  });
});
