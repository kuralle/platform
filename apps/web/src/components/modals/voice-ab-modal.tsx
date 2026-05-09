import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Sparkline } from "@kuralle/ui/components/sparkline";
import { VoicePreviewChip } from "@kuralle/ui/components/voice-preview-chip";
import { cn } from "@kuralle/ui/lib/utils";
import { useState } from "react";

interface VoiceAbModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIDE_A = { id: "v_aurora", name: "Aurora", language: "en-US" };
const SIDE_B = { id: "v_lyra", name: "Lyra", language: "en-US" };

export function VoiceAbModal({ open, onOpenChange }: VoiceAbModalProps) {
  const [pick, setPick] = useState<"a" | "b">("a");
  const [phrase, setPhrase] = useState(
    "Thanks for calling, this is your virtual dispatcher — how can I help today?",
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">Compare two voices</DialogTitle>
          <DialogDescription>
            Same phrase. Two voices. Pick the one that fits your brand. The selected voice replaces the agent's current voice.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="phrase">Test phrase</FieldLabel>
          <Input id="phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {[
            { side: "a" as const, voice: SIDE_A },
            { side: "b" as const, voice: SIDE_B },
          ].map(({ side, voice }) => (
            <button
              key={side}
              type="button"
              onClick={() => setPick(side)}
              className={cn(
                "flex flex-col gap-3 rounded-md border bg-background p-4 text-left transition",
                pick === side ? "border-primary bg-primary/5" : "hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-[14px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  Side {side.toUpperCase()}
                </span>
                <span
                  className={cn(
                    "size-3 rounded-full border-2",
                    pick === side ? "border-primary bg-primary" : "border-border",
                  )}
                />
              </div>
              <VoicePreviewChip voiceId={voice.id} voiceName={voice.name} language={voice.language} />
              <Card className="bg-muted/40 p-3">
                <Sparkline
                  data={Array.from({ length: 32 }, () => Math.random())}
                  width={260}
                  height={64}
                  tone="signal"
                  className="w-full"
                />
              </Card>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onOpenChange(false)}>Use Side {pick.toUpperCase()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
