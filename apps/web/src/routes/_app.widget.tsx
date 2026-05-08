import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
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
import { Bot, Mic, Phone } from "lucide-react";
import { useEffect, useState } from "react";

import { useActiveWorkspaceId } from "@/contexts/workspace";
import { useWidgetConfig, useUpdateWidgetConfig } from "@/hooks/api/widget";

export const Route = createFileRoute("/_app/widget")({
  component: WidgetRoute,
});

const SECTIONS = [
  "modality",
  "avatar",
  "theme",
  "strings",
  "vars",
  "overrides",
  "feedback",
  "terms",
  "variant",
] as const;

function WidgetRoute() {
  const workspaceId = useActiveWorkspaceId();
  const { data: config, isLoading } = useWidgetConfig({ workspaceId });
  const updateWidget = useUpdateWidgetConfig();

  const [modality, setModality] = useState<"voice" | "chat" | "both">("both");
  const [accent, setAccent] = useState("#0EA5A6");
  const [greeting, setGreeting] = useState("Hi! Ask me anything.");
  const [ctaLabel, setCtaLabel] = useState("Talk to dispatcher");
  const [showFeedback, setShowFeedback] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized) {
      if (config.modality) setModality(config.modality as "voice" | "chat" | "both");
      if (config.feedbackEnabled != null) setShowFeedback(config.feedbackEnabled);
      if (config.strings && typeof config.strings === "object") {
        const s = config.strings as Record<string, string>;
        if (s.greeting) setGreeting(s.greeting);
        if (s.ctaLabel) setCtaLabel(s.ctaLabel);
      }
      setInitialized(true);
    }
  }, [config, initialized]);

  const changes = config
    ? ((modality !== (config.modality ?? "both") ? 1 : 0) +
       (showFeedback !== (config.feedbackEnabled ?? true) ? 1 : 0) +
       (greeting !== ((config.strings as Record<string, string>)?.greeting ?? "Hi! Ask me anything.") ? 1 : 0))
    : 0;

  const handleSave = () => {
    updateWidget.mutate({
      workspaceId,
      modality,
      feedbackEnabled: showFeedback,
      strings: { greeting, ctaLabel },
      theme: { accent },
    });
  };

  const handleDiscard = () => {
    if (config) {
      setModality((config.modality as "voice" | "chat" | "both") ?? "both");
      setShowFeedback(config.feedbackEnabled ?? true);
      const s = (config.strings as Record<string, string>) ?? {};
      setGreeting(s.greeting ?? "Hi! Ask me anything.");
      setCtaLabel(s.ctaLabel ?? "Talk to dispatcher");
      setAccent("#0EA5A6");
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
            <div className="relative h-full w-full max-w-[720px] rounded-lg border bg-card shadow-[0_24px_60px_rgba(11,18,32,0.06)]">
              <div className="grid h-full grid-rows-[auto_1fr_auto]">
                <div className="border-b px-6 py-4">
                  <div className="font-display text-[16px] font-semibold">preview</div>
                </div>
                <div className="flex items-center justify-center text-muted-foreground text-[12px]">
                  Page content shown by your CMS
                </div>
                <div className="absolute right-4 bottom-4 flex w-[300px] flex-col gap-3 rounded-lg border bg-card p-4 shadow-[0_18px_40px_rgba(11,18,32,0.12)]">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid size-9 place-items-center rounded-full text-card"
                      style={{ background: accent }}
                    >
                      <Bot size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">Widget preview</div>
                      <div className="text-[11px] text-muted-foreground">Online · replies in seconds</div>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted px-3 py-2 text-[13px]">{greeting}</div>
                  <Button className="gap-2" style={{ background: accent }}>
                    {modality === "voice" ? <Mic size={14} /> : <Phone size={14} />}
                    {ctaLabel}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40} minSize={32}>
          <ScrollArea className="h-full">
            <div className="p-5">
              <Tabs defaultValue="modality">
                <TabsList className="flex-wrap">
                  {SECTIONS.map((s) => (
                    <TabsTrigger key={s} value={s} className="capitalize">
                      {s}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="modality" className="mt-4 grid gap-3">
                  {(["voice", "chat", "both"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setModality(m)}
                      className={cn(
                        "flex items-center gap-3 rounded-md border bg-background p-3 text-left text-[13px] transition",
                        modality === m && "border-primary bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "size-3 rounded-full border-2",
                          modality === m ? "border-primary bg-primary" : "border-border",
                        )}
                      />
                      <span className="font-medium capitalize">{m}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {m === "voice" ? "WebRTC + bridge to PSTN" : m === "chat" ? "Text-only" : "Voice + chat"}
                      </span>
                    </button>
                  ))}
                </TabsContent>
                <TabsContent value="theme" className="mt-4 grid gap-3">
                  <Field>
                    <FieldLabel>Accent colour</FieldLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accent}
                        onChange={(e) => setAccent(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded border bg-background"
                      />
                      <Input
                        value={accent}
                        onChange={(e) => setAccent(e.target.value)}
                        className="font-mono text-[13px] tabular-nums"
                      />
                    </div>
                  </Field>
                </TabsContent>
                <TabsContent value="strings" className="mt-4 grid gap-3">
                  <Field>
                    <FieldLabel htmlFor="greet">Greeting</FieldLabel>
                    <Textarea
                      id="greet"
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="cta">CTA label</FieldLabel>
                    <Input id="cta" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} />
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
                {SECTIONS.filter((s) => !["modality", "theme", "strings", "feedback"].includes(s)).map((s) => (
                  <TabsContent key={s} value={s} className="mt-4">
                    <Card className="p-4 text-[12px] text-muted-foreground">
                      {s} configuration · placeholder. Each section can be deeply customized.
                    </Card>
                  </TabsContent>
                ))}
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
