import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { buildEmbedSnippet } from "@/components/widget/embed-snippet";
import { server } from "@/test/msw-server";
import { WidgetRoute } from "@/routes/_app.widget";

const BASE_URL = "http://localhost:8787/rpc";
const WORKSPACE_ID = "ws_test";
const SERVER_URL = "https://api.kuralle.test";

vi.mock("@/contexts/workspace", () => ({
  useActiveWorkspaceId: () => WORKSPACE_ID,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function baseWidgetConfig(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    modality: "both",
    theme: {
      primaryColor: "#14B8A6",
      theme: "light",
      position: "bottom-right",
    },
    strings: {
      title: "Chat with us",
      subtitle: "We're here to help",
      greeting: "Hi! Ask me anything.",
    },
    vars: null,
    feedbackEnabled: true,
    termsUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    embedKey: "wk_testembedkey123456789012",
    serverUrl: SERVER_URL,
    ...overrides,
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("widget editor screen", () => {
  it("shows enable CTA when embedKey is null, then reveals key after enable", async () => {
    const user = userEvent.setup();
    let embedKey: string | null = null;

    server.use(
      http.post(`${BASE_URL}/widget/get`, () =>
        HttpResponse.json({
          json: baseWidgetConfig({ embedKey: embedKey }),
        }),
      ),
      http.post(`${BASE_URL}/widget/enable`, () => {
        embedKey = "wk_newlyenabledkey123456789";
        return HttpResponse.json({
          json: {
            embedKey,
            endpointId: "che_widget_1",
          },
        });
      }),
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        HttpResponse.json({
          json: {
            items: [
              {
                id: "che_widget_1",
                workspaceId: WORKSPACE_ID,
                connectionId: null,
                channelKind: "widget",
                identifier: embedKey ?? "wk_pending",
                displayName: null,
                attachedAgentId: null,
                attachedAgentVersionId: null,
                routingRulesId: null,
                publicWebhookUrl: null,
                publicStreamUrl: null,
                metadata: null,
                createdAt: new Date().toISOString(),
                releasedAt: null,
              },
            ],
          },
        }),
      ),
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({ json: { items: [], cursor: null } }),
      ),
    );

    render(<WidgetRoute />, { wrapper });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Enable web widget" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Enable web widget" }));

    await waitFor(() => {
      expect(screen.getByText("wk_newlyenabledkey123456789")).toBeInTheDocument();
    });
  });

  it("persists styling changes via widget.update with theme payload", async () => {
    const user = userEvent.setup();
    let updatePayload: { theme?: Record<string, unknown> } | undefined;

    server.use(
      http.post(`${BASE_URL}/widget/get`, () =>
        HttpResponse.json({ json: baseWidgetConfig() }),
      ),
      http.post(`${BASE_URL}/widget/update`, async ({ request }) => {
        const body = (await request.json()) as { json: Record<string, unknown> };
        updatePayload = body.json;
        return HttpResponse.json({
          json: baseWidgetConfig({
            theme: body.json.theme,
          }),
        });
      }),
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        HttpResponse.json({ json: { items: [] } }),
      ),
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({ json: { items: [], cursor: null } }),
      ),
    );

    render(<WidgetRoute />, { wrapper });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "theme" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "theme" }));
    await user.click(screen.getByRole("button", { name: "dark" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updatePayload?.theme).toBeDefined();
    });

    expect(updatePayload?.theme).toMatchObject({
      primaryColor: "#14B8A6",
      theme: "dark",
      position: "bottom-right",
    });
  });

  it("embed snippet contains embedKey and serverUrl", async () => {
    server.use(
      http.post(`${BASE_URL}/widget/get`, () =>
        HttpResponse.json({ json: baseWidgetConfig() }),
      ),
      http.post(`${BASE_URL}/channels/endpoints/listByKind`, () =>
        HttpResponse.json({ json: { items: [] } }),
      ),
      http.post(`${BASE_URL}/agents/list`, () =>
        HttpResponse.json({ json: { items: [], cursor: null } }),
      ),
    );

    render(<WidgetRoute />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Embed snippet")).toBeInTheDocument();
    });

    const snippet = screen.getByText(/agent-url="/).textContent ?? "";
    expect(snippet).toContain("wk_testembedkey123456789012");
    expect(snippet).toContain(SERVER_URL);
    expect(snippet).toContain('agent-id="wk_testembedkey123456789012"');
  });
});

describe("buildEmbedSnippet", () => {
  it("mirrors kuralle-widget agent-url and agent-id attributes", () => {
    const snippet = buildEmbedSnippet({
      serverUrl: SERVER_URL,
      embedKey: "wk_abc123",
      theme: { primaryColor: "#14B8A6", theme: "light", position: "bottom-right" },
      strings: { title: "Hi", subtitle: "Help", greeting: "Hello" },
    });

    expect(snippet).toContain(SERVER_URL);
    expect(snippet).toContain('agent-url="https://api.kuralle.test"');
    expect(snippet).toContain('agent-id="wk_abc123"');
    expect(snippet).toContain("@kuralle-agents/widget@latest/dist/widget.js");
  });
});
