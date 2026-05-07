import { Button } from "@kuralle/ui/components/button";
import { Card } from "@kuralle/ui/components/card";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Slider } from "@kuralle/ui/components/slider";
import { Textarea } from "@kuralle/ui/components/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@kuralle/ui/components/tooltip";
import { createFileRoute } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { useWorkspace } from "@/contexts/workspace";
import { useEditor } from "@/contexts/editor";
import { useAgent } from "@/hooks/api/agents";

export const Route = createFileRoute("/_app/agents/$agentId/behavior")({
  component: BehaviorTab,
});

function BehaviorTab() {
  const { agentId } = Route.useParams();
  const { workspace } = useWorkspace();
  const { state, dispatch, seeded } = useEditor();
  const agentQuery = useAgent({ workspaceId: workspace.id, agentId });

  const ir = state.ir;
  // R2-1 fix: gate on the explicit `seeded` flag from the parent layout, not
  // on IR field truthiness. An empty-string `instructions` is a valid IR
  // state (user cleared the field) and must NOT trigger the loading branch.
  if (!seeded) {
    return (
      <AgentEditorShell
        agentId={agentId}
        agentName={agentQuery.data?.agent?.id ?? agentId}
        status="draft"
        changes={0}
        onSave={() => undefined}
        onDiscard={() => undefined}
        hideStickyBar
      >
        <div className="grid place-items-center py-20 text-muted-foreground">
          Loading agent configuration…
        </div>
      </AgentEditorShell>
    );
  }

  const agent = agentQuery.data?.agent;
  const agentName = agent?.id
    ? ir.name || agent.id
    : ir.name || agentId;
  const status = (agent?.status as "live" | "paused" | "draft") ?? "draft";
  const temp = ir.model?.temperature ?? 0.4;

  return (
    <AgentEditorShell
      agentId={agentId}
      agentName={agentName}
      status={status}
      changes={state.ir !== state.original ? 1 : 0}
      onSave={() => undefined}
      onDiscard={() => dispatch({ type: "set", ir: state.original })}
      hideStickyBar
    >
      <div className="grid gap-6">
        <Card className="p-6">
          <Eyebrow>Identity</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Name + description</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The agent name and a short description used when this agent is consumed by another
            (via <span className="font-mono text-[12px]">agent.asTool()</span>) or surfaced in the workflow picker.
          </p>
          <Field className="mt-4">
            <FieldLabel htmlFor="agent-name">Name</FieldLabel>
            <Input
              id="agent-name"
              value={ir.name}
              onChange={(e) => dispatch({ type: "patch", patch: { name: e.target.value } })}
            />
          </Field>
          <Field className="mt-3">
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <Textarea
              id="description"
              value={ir.description}
              onChange={(e) => dispatch({ type: "patch", patch: { description: e.target.value } })}
              className="min-h-[72px] text-[13px]"
              placeholder="One sentence: what does this agent do, and when should another agent consult it?"
            />
          </Field>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <Eyebrow>System prompt</Eyebrow>
              <h2 className="mt-1 font-display text-[18px] font-semibold">Behaviour contract</h2>
            </div>
            <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
              {ir.instructions.length.toLocaleString()} chars · ~{Math.ceil(ir.instructions.length / 4).toLocaleString()} tokens
            </span>
          </div>
          <Textarea
            value={ir.instructions}
            onChange={(e) => dispatch({ type: "patch", patch: { instructions: e.target.value } })}
            className="mt-4 min-h-[260px] font-mono text-[13px]"
          />
          <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>Markdown supported. Tool calls reference your enabled tools.</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="ghost" className="h-7 gap-1 px-2 text-[11px]">
                    <Info size={12} /> Cost preview
                  </Button>
                }
              />
              <TooltipContent>
                ≈ <span className="font-mono tabular-nums text-foreground">$0.024</span> per turn at this length, current model.
              </TooltipContent>
            </Tooltip>
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>Sampling</Eyebrow>
          <h2 className="mt-1 font-display text-[18px] font-semibold">Temperature</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Lower is consistent. Higher is conversational. We recommend 0.4 for ops-style agents.
          </p>
          <div className="mt-5 flex items-center gap-4">
            <span className="font-mono text-[24px] tabular-nums text-foreground">{temp.toFixed(2)}</span>
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[temp]}
              onValueChange={(vals) => {
                const v = typeof vals === "number" ? vals : vals[0];
                if (v !== undefined) {
                  dispatch({
                    type: "patch",
                    patch: { model: { ...ir.model, temperature: v } },
                  });
                }
              }}
              className="flex-1"
            />
          </div>
        </Card>
      </div>
    </AgentEditorShell>
  );
}
