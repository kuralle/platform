import { Alert, AlertDescription, AlertTitle } from "@kuralle/ui/components/alert";
import { Button } from "@kuralle/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kuralle/ui/components/dialog";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kuralle/ui/components/select";
import { Switch } from "@kuralle/ui/components/switch";
import { Textarea } from "@kuralle/ui/components/textarea";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

interface DisclosureScriptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATES = {
  generic: 'Hi, this is an AI dispatcher for {brand}. This call is recorded for quality.',
  hipaa: 'Hi, you\'ve reached {brand}. This call is being recorded and may include protected health information. Continue if you consent.',
  ferpa: 'Hi, this is an AI assistant for {institution}. We may discuss educational records covered by FERPA. We need to verify your identity before disclosure.',
  tcpa: 'Hi, this is {brand}. This call may be recorded. To opt out at any time, say or text STOP.',
  ca_sb1001:
    "Hi, you're chatting with an AI for {brand}. This is required disclosure under California SB 1001. Press 0 anytime to reach a human.",
};

export function DisclosureScriptModal({ open, onOpenChange }: DisclosureScriptModalProps) {
  const [tpl, setTpl] = useState<keyof typeof TEMPLATES>("ca_sb1001");
  const [script, setScript] = useState(TEMPLATES.ca_sb1001);
  const [verbal, setVerbal] = useState(true);
  const [written, setWritten] = useState(false);
  const [autoInject, setAutoInject] = useState(true);

  const lint = useMemo(() => {
    const issues: { ok: boolean; label: string }[] = [];
    issues.push({ ok: script.includes("{brand}") || script.includes("Calderon"), label: "Identifies the brand or operator." });
    issues.push({ ok: /record/i.test(script), label: "Mentions recording." });
    issues.push({ ok: /(opt[- ]out|STOP|press 0|human)/i.test(script), label: "Provides an opt-out path." });
    issues.push({ ok: script.length < 280, label: "Under 280 characters (one breath)." });
    return issues;
  }, [script]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">Disclosure script</DialogTitle>
          <DialogDescription>
            What the agent reads on every call before it does anything else.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel>Template</FieldLabel>
            <Select
              value={tpl}
              onValueChange={(v) => {
                setTpl(v as keyof typeof TEMPLATES);
                setScript(TEMPLATES[v as keyof typeof TEMPLATES]);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generic">Generic</SelectItem>
                <SelectItem value="hipaa">HIPAA</SelectItem>
                <SelectItem value="ferpa">FERPA</SelectItem>
                <SelectItem value="tcpa">TCPA</SelectItem>
                <SelectItem value="ca_sb1001">California SB 1001 (AI bot disclosure)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds">Script</FieldLabel>
            <Textarea
              id="ds"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              className="min-h-[120px] font-mono text-[13px]"
            />
          </Field>
          <Alert>
            <ShieldAlert />
            <AlertTitle>Real-time linter</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 grid gap-1.5">
                {lint.map((it) => (
                  <li key={it.label} className="flex items-center gap-2 text-[12px]">
                    <CheckCircle2
                      size={12}
                      className={it.ok ? "text-emerald-500" : "text-muted-foreground"}
                    />
                    <span className={it.ok ? "text-foreground" : "text-muted-foreground"}>{it.label}</span>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
          <div className="grid gap-2">
            <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-[13px]">Read verbally on every call</span>
              <Switch checked={verbal} onCheckedChange={setVerbal} />
            </label>
            <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-[13px]">Append in written transcript</span>
              <Switch checked={written} onCheckedChange={setWritten} />
            </label>
            <label className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
              <span className="text-[13px]">Auto-inject into system prompt</span>
              <Switch checked={autoInject} onCheckedChange={setAutoInject} />
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onOpenChange(false)}>Save script</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
