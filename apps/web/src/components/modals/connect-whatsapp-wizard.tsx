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
import { Input } from "@kuralle/ui/components/input";
import { useState } from "react";

import {
  useAttachEndpoint,
  useConnectMetaChannel,
} from "@/hooks/api/channels";
import { useAgents } from "@/hooks/api/agents";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kuralle/ui/components/select";

interface ConnectWhatsAppWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function ConnectWhatsAppWizard({
  open,
  onOpenChange,
  workspaceId,
}: ConnectWhatsAppWizardProps) {
  const connect = useConnectMetaChannel();
  const attach = useAttachEndpoint();
  const agentsQuery = useAgents({ workspaceId, limit: 100 });

  const [displayName, setDisplayName] = useState("WhatsApp Business");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [availableNumbers, setAvailableNumbers] = useState<
    Array<{ phoneNumberId: string; displayPhoneNumber: string }>
  >([]);

  const step = connectionId ? "attach" : "connect";
  const agents = agentsQuery.data?.items ?? [];

  function reset() {
    setDisplayName("WhatsApp Business");
    setAccessToken("");
    setAppSecret("");
    setConnectionId(null);
    setPhoneNumberId("");
    setAgentId("");
    setAvailableNumbers([]);
  }

  async function handleConnect() {
    const result = await connect.mutateAsync({
      workspaceId,
      provider: "meta-whatsapp-cloud",
      displayName,
      ...(accessToken ? { accessToken } : {}),
      ...(appSecret ? { appSecret } : {}),
    });
    setConnectionId(result.connectionId);
    setAvailableNumbers(result.availablePhoneNumbers);
    if (result.availablePhoneNumbers[0]) {
      setPhoneNumberId(result.availablePhoneNumbers[0].phoneNumberId);
    }
  }

  async function handleAttach() {
    if (!connectionId || !phoneNumberId || !agentId) return;
    await attach.mutateAsync({
      workspaceId,
      connectionId,
      phoneNumberId,
      agentId,
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px]">
            Connect WhatsApp
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            Store your Meta credentials per workspace, attach a phone number, and
            bind a published agent. Leave token fields blank to use the platform
            sandbox credentials.
          </DialogDescription>
        </DialogHeader>

        {step === "connect" ? (
          <div className="grid gap-4 py-2">
            <Field>
              <FieldLabel>Connection name</FieldLabel>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>System user access token (optional)</FieldLabel>
              <Input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAA…"
              />
            </Field>
            <Field>
              <FieldLabel>App secret (optional)</FieldLabel>
              <Input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <Field>
              <FieldLabel>Phone number</FieldLabel>
              <Select value={phoneNumberId} onValueChange={(v) => { if (v != null) setPhoneNumberId(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a number" />
                </SelectTrigger>
                <SelectContent>
                  {availableNumbers.map((n) => (
                    <SelectItem key={n.phoneNumberId} value={n.phoneNumberId}>
                      {n.displayPhoneNumber || n.phoneNumberId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Published agent</FieldLabel>
              <Select value={agentId} onValueChange={(v) => { if (v != null) setAgentId(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "connect" ? (
            <Button
              onClick={() => void handleConnect()}
              disabled={connect.isPending || !displayName.trim()}
            >
              {connect.isPending ? "Connecting…" : "Connect account"}
            </Button>
          ) : (
            <Button
              onClick={() => void handleAttach()}
              disabled={
                attach.isPending || !phoneNumberId || !agentId
              }
            >
              {attach.isPending ? "Attaching…" : "Attach number"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
