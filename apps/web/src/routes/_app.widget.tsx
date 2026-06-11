import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@kuralle/ui/components/resizable";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { StickySaveBar } from "@kuralle/ui/components/sticky-save-bar";
import { Switch } from "@kuralle/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kuralle/ui/components/tabs";
import { Textarea } from "@kuralle/ui/components/textarea";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { WidgetDistributionPanel } from "@/components/widget/WidgetDistributionPanel";
import { WidgetPreview } from "@/components/widget/WidgetPreview";
import {
  DEFAULT_WIDGET_STRINGS,
  DEFAULT_WIDGET_THEME,
  parseWidgetStrings,
  parseWidgetTheme,
  type WidgetStringsConfig,
  type WidgetThemeConfig,
} from "@/components/widget/types";
import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useUpdateWidgetConfig, useWidgetConfig } from "@/hooks/api/widget";

export const Route = createFileRoute("/_app/widget")({
  component: WidgetRoute,
});

const SECTIONS = ["modality", "theme", "strings", "feedback"] as const;

export function WidgetRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: config, isLoading } = useWidgetConfig({ workspaceId });
  const updateWidget = useUpdateWidgetConfig();

  const [modality, setModality] = useState<"voice" | "chat" | "both">("both");
  const [theme, setTheme] = useState<WidgetThemeConfig>(DEFAULT_WIDGET_THEME);
  const [strings, setStrings] = useState<WidgetStringsConfig>(DEFAULT_WIDGET_STRINGS);
  const [showFeedback, setShowFeedback] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized) {
      if (config.modality) setModality(config.modality as "voice" | "chat" | "both");
      if (config.feedbackEnabled != null) setShowFeedback(config.feedbackEnabled);
      setTheme(parseWidgetTheme(config.theme));
      setStrings(parseWidgetStrings(config.strings));
      setInitialized(true);
    }
  }, [config, initialized]);

  const savedTheme = useMemo(
    () => (config ? parseWidgetTheme(config.theme) : DEFAULT_WIDGET_THEME),
    [config],
  );
  const savedStrings = useMemo(
    () => (config ? parseWidgetStrings(config.strings) : DEFAULT_WIDGET_STRINGS),
    [config],
  );

  const changes = config
    ? (modality !== (config.modality ?? "both") ? 1 : 0) +
      (showFeedback !== (config.feedbackEnabled ?? true) ? 1 : 0) +
      (theme.primaryColor !== savedTheme.primaryColor ? 1 : 0) +
      (theme.theme !== savedTheme.theme ? 1 : 0) +
      (theme.position !== savedTheme.position ? 1 : 0) +
      (strings.title !== savedStrings.title ? 1 : 0) +
      (strings.subtitle !== savedStrings.subtitle ? 1 : 0) +
      (strings.greeting !== savedStrings.greeting ? 1 : 0)
    : 0;

  const handleSave = () => {
    updateWidget.mutate({
      workspaceId,
      modality,
      feedbackEnabled: showFeedback,
      strings: {
        title: strings.title,
        subtitle: strings.subtitle,
        greeting: strings.greeting,
      },
      theme: {
        primaryColor: theme.primaryColor,
        theme: theme.theme,
        position: theme.position,
      },
    });
  };

  const handleDiscard = () => {
    if (config) {
      setModality((config.modality as "voice" | "chat" | "both") ?? "both");
      setShowFeedback(config.feedbackEnabled ?? true);
      setTheme(savedTheme);
      setStrings(savedStrings);
    }
  };

  if (isLoading) {
    return (
      <div className="grid h-[calc(100svh-3.5rem)] grid-rows-[auto_1fr]">
        <div className="border-b bg-card px-8 py-4">
          <Eyebrow>Distribute</Eyebrow>
          <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight">Widget customizer</h1>
        </div>
        <div className="flex items-center justify-center text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const embedKey = config?.embedKey ?? null;
  const serverUrl = config?.serverUrl ?? "";

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-rows-[auto_1fr]">
      <div className="border-b bg-card px-8 py-4">
        <Eyebrow>Distribute</Eyebrow>
        <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight">Widget customizer</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
          Live preview on the left, customization on the right. Embed anywhere with a single script tag.
        </p>
      </div>
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex h-full items-center justify-center bg-muted/60 p-8">
            <WidgetPreview theme={theme} strings={strings} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40} minSize={32}>
          <ScrollArea className="h-full">
            <div className="p-5">
              <WidgetDistributionPanel
                workspaceId={workspaceId}
                embedKey={embedKey}
                serverUrl={serverUrl}
                theme={theme}
                strings={strings}
              />
              <Tabs defaultValue="modality">
                <TabsList className="flex-wrap">
                  {SECTIONS.map((s) => (
                    <TabsTrigger key={s} value={s} className="capitalize">
                      {s}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="modality" className="mt-4 grid gap-3">
                  {(["voice", "chat", "both"] as const).map((m) => {
                    const disabled = m === "voice";
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) setModality(m);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-md border bg-background p-3 text-left text-[13px] transition",
                          modality === m && "border-primary bg-primary/5",
                          disabled && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3 rounded-full border-2",
                            modality === m ? "border-primary bg-primary" : "border-border",
                          )}
                        />
                        <span className="font-medium capitalize">{m}</span>
                        <span className="ml-auto text-right text-[11px] text-muted-foreground">
                          {m === "voice"
                            ? "Voice channel ships with the voice track"
                            : m === "chat"
                              ? "Text-only"
                              : "Voice + chat"}
                        </span>
                      </button>
                    );
                  })}
                </TabsContent>
                <TabsContent value="theme" className="mt-4 grid gap-3">
                  <Field>
                    <FieldLabel>Primary colour</FieldLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={theme.primaryColor}
                        onChange={(e) =>
                          setTheme((prev) => ({ ...prev, primaryColor: e.target.value }))
                        }
                        className="h-9 w-12 cursor-pointer rounded border bg-background"
                      />
                      <Input
                        value={theme.primaryColor}
                        onChange={(e) =>
                          setTheme((prev) => ({ ...prev, primaryColor: e.target.value }))
                        }
                        className="font-mono text-[13px] tabular-nums"
                      />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Theme</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(["light", "dark"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setTheme((prev) => ({ ...prev, theme: mode }))}
                          className={cn(
                            "rounded-md border px-3 py-2 text-[13px] capitalize transition",
                            theme.theme === mode && "border-primary bg-primary/5",
                          )}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Position</FieldLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(["bottom-right", "bottom-left"] as const).map((position) => (
                        <button
                          key={position}
                          type="button"
                          onClick={() => setTheme((prev) => ({ ...prev, position }))}
                          className={cn(
                            "rounded-md border px-3 py-2 text-[13px] transition",
                            theme.position === position && "border-primary bg-primary/5",
                          )}
                        >
                          {position.replace("-", " ")}
                        </button>
                      ))}
                    </div>
                  </Field>
                </TabsContent>
                <TabsContent value="strings" className="mt-4 grid gap-3">
                  <Field>
                    <FieldLabel htmlFor="widget-title">Title</FieldLabel>
                    <Input
                      id="widget-title"
                      value={strings.title}
                      onChange={(e) =>
                        setStrings((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-subtitle">Subtitle</FieldLabel>
                    <Input
                      id="widget-subtitle"
                      value={strings.subtitle}
                      onChange={(e) =>
                        setStrings((prev) => ({ ...prev, subtitle: e.target.value }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="widget-greeting">Greeting</FieldLabel>
                    <Textarea
                      id="widget-greeting"
                      value={strings.greeting}
                      onChange={(e) =>
                        setStrings((prev) => ({ ...prev, greeting: e.target.value }))
                      }
                    />
                  </Field>
                </TabsContent>
                <TabsContent value="feedback" className="mt-4">
                  <Card className="flex items-center justify-between p-4">
                    <div>
                      <div className="text-[13px] font-medium">Show feedback prompt at end</div>
                      <div className="text-[12px] text-muted-foreground">Thumbs up/down + freeform.</div>
                    </div>
                    <Switch checked={showFeedback} onCheckedChange={setShowFeedback} />
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
      {changes > 0 && (
        <StickySaveBar
          changes={changes}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}
      {updateWidget.isError && (
        <Alert variant="destructive">
          <AlertTitle>Failed to save widget config</AlertTitle>
          <AlertDescription>{(updateWidget.error as Error)?.message ?? "Unknown error"}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
