export type WidgetThemeMode = "light" | "dark";
export type WidgetPosition = "bottom-right" | "bottom-left";

export interface WidgetThemeConfig {
  primaryColor: string;
  theme: WidgetThemeMode;
  position: WidgetPosition;
}

export interface WidgetStringsConfig {
  title: string;
  subtitle: string;
  greeting: string;
}

export const DEFAULT_WIDGET_THEME: WidgetThemeConfig = {
  primaryColor: "#14B8A6",
  theme: "light",
  position: "bottom-right",
};

export const DEFAULT_WIDGET_STRINGS: WidgetStringsConfig = {
  title: "Chat with us",
  subtitle: "We're here to help",
  greeting: "Hi! Ask me anything.",
};

export function parseWidgetTheme(raw: unknown): WidgetThemeConfig {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const primaryColor =
    typeof t.primaryColor === "string"
      ? t.primaryColor
      : typeof t.accent === "string"
        ? t.accent
        : DEFAULT_WIDGET_THEME.primaryColor;
  const theme = t.theme === "dark" ? "dark" : "light";
  const position =
    t.position === "bottom-left" ? "bottom-left" : "bottom-right";
  return { primaryColor, theme, position };
}

export function parseWidgetStrings(raw: unknown): WidgetStringsConfig {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    title: typeof s.title === "string" ? s.title : DEFAULT_WIDGET_STRINGS.title,
    subtitle:
      typeof s.subtitle === "string" ? s.subtitle : DEFAULT_WIDGET_STRINGS.subtitle,
    greeting:
      typeof s.greeting === "string" ? s.greeting : DEFAULT_WIDGET_STRINGS.greeting,
  };
}
