import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@kuralle/ui/components/resizable";
import { ScrollArea } from "@kuralle/ui/components/scroll-area";
import { Switch } from "@kuralle/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kuralle/ui/components/tabs";
import { Textarea } from "@kuralle/ui/components/textarea";
import { cn } from "@kuralle/ui/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Mic, Phone } from "lucide-react";
import { useState } from "react";

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
  const [modality, setModality] = useState<"voice" | "chat" | "both">("both");
  const [accent, setAccent] = useState("#0EA5A6");
  const [greeting, setGreeting] = useState("Hi! Ask me anything about Calderon HVAC.");
  const [ctaLabel, setCtaLabel] = useState("Talk to dispatcher");
  const [showFeedback, setShowFeedback] = useState(true);

  return (
    <div className="grid h-[calc(100svh-3.5rem)] grid-rows-[auto_1fr]">
      <div className="border-b bg-card px-8 py-4">
        <Eyebrow>Distribute</Eyebrow>
        <h1 className="mt-1 font-display text-[24px] font-semibold tracking-tight">Widget customizer</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-mute-slate">
          Live preview on the left, customization on the right. Embed anywhere with a single script tag.
        </p>
      </div>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex h-full items-center justify-center bg-soft-hairline/60 p-8">
            <div className="relative h-full w-full max-w-[720px] rounded-lg border bg-paper-white shadow-[0_24px_60px_rgba(11,18,32,0.06)]">
              <div className="grid h-full grid-rows-[auto_1fr_auto]">
                <div className="border-b px-6 py-4">
                  <div className="font-display text-[16px] font-semibold">calderonhvac.com / preview</div>
                </div>
                <div className="flex items-center justify-center text-mute-slate text-[12px]">
                  Page content shown by your CMS
                </div>
                <div className="absolute right-4 bottom-4 flex w-[300px] flex-col gap-3 rounded-lg border bg-paper-white p-4 shadow-[0_18px_40px_rgba(11,18,32,0.12)]">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid size-9 place-items-center rounded-full text-paper-white"
                      style={{ background: accent }}
                    >
                      <Bot size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">Calderon HVAC</div>
                      <div className="text-[11px] text-mute-slate">Online · replies in seconds</div>
                    </div>
                  </div>
                  <div className="rounded-md bg-soft-hairline px-3 py-2 text-[13px]">{greeting}</div>
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
                        modality === m && "border-signal-teal bg-signal-teal/5",
                      )}
                    >
                      <span
                        className={cn(
                          "size-3 rounded-full border-2",
                          modality === m ? "border-signal-teal bg-signal-teal" : "border-border",
                        )}
                      />
                      <span className="font-medium capitalize">{m}</span>
                      <span className="ml-auto text-[11px] text-mute-slate">
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
                      <div className="text-[12px] text-mute-slate">Thumbs up/down + freeform.</div>
                    </div>
                    <Switch checked={showFeedback} onCheckedChange={setShowFeedback} />
                  </Card>
                </TabsContent>
                {SECTIONS.filter((s) => !["modality", "theme", "strings", "feedback"].includes(s)).map((s) => (
                  <TabsContent key={s} value={s} className="mt-4">
                    <Card className="p-4 text-[12px] text-mute-slate">
                      {s} configuration · placeholder. Each section can be deeply customized.
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </ScrollArea>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
