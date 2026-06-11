import type { WidgetStringsConfig, WidgetThemeConfig } from "./types";

const WIDGET_SCRIPT =
  "https://unpkg.com/@kuralle-agents/widget@latest/dist/widget.js";

export function buildEmbedSnippet(opts: {
  serverUrl: string;
  embedKey: string;
  theme: WidgetThemeConfig;
  strings: WidgetStringsConfig;
}): string {
  const agentUrl = opts.serverUrl.replace(/\/$/, "");
  const attrs = [
    `agent-url="${agentUrl}"`,
    `agent-id="${opts.embedKey}"`,
    `accent-color="${opts.theme.primaryColor}"`,
    `theme="${opts.theme.theme}"`,
    `position="${opts.theme.position}"`,
    `title="${escapeAttr(opts.strings.title)}"`,
    `subtitle="${escapeAttr(opts.strings.subtitle)}"`,
  ];
  return [
    `<script src="${WIDGET_SCRIPT}" async></script>`,
    `<kuralle-widget`,
    `  ${attrs.join("\n  ")}`,
    `></kuralle-widget>`,
  ].join("\n");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}
