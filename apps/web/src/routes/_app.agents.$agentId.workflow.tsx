import "@xyflow/react/dist/style.css";

import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
import { Field, FieldLabel } from "@kuralle/ui/components/field";
import { Input } from "@kuralle/ui/components/input";
import { Textarea } from "@kuralle/ui/components/textarea";
import { cn } from "@kuralle/ui/lib/utils";
import {
  Background,
  type Edge as EdgeType,
  MarkerType,
  type Node as NodeType,
  ReactFlow,
  type ReactFlowProps,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  ClipboardList,
  Phone,
  PhoneOff,
  Play,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { Controls } from "@/components/workflow/controls";
import { Edge as WfEdge } from "@/components/workflow/edge";
import {
  Node as WfNode,
  NodeContent,
  NodeDescription,
  NodeHeader,
  NodeTitle,
} from "@/components/workflow/node";
import { Panel as WfPanel } from "@/components/workflow/panel";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/workflow")({
  component: WorkflowTab,
});

// ---------- node types ----------------------------------------------------

type NodeKind = "subagent" | "extraction" | "dispatch" | "transfer-agent" | "transfer-number" | "end";

interface NodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  description?: string;
  /** Subagent / extraction prompt. */
  prompt?: string;
  llmOverride?: string;
  /** Dispatch tool name. */
  toolName?: string;
  /** Transfer-* destination. */
  transferTo?: string;
  /** Subagent tool list. */
  tools?: string[];
  /** Extraction-only config — modelled on AriaFlow ExtractionNodeConfig. */
  extraction?: {
    requiredFields: string[];
    schema: string;
    maxTurns: number;
    completeTransition: string;
    promptMode: "llm" | "deterministic";
  };
}

const KIND_META: Record<NodeKind, { label: string; icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  subagent:        { label: "Subagent",         icon: Sparkles,        tone: "border-primary/40 bg-primary/5" },
  extraction:      { label: "Extraction",       icon: ClipboardList,   tone: "border-cyan-500/40 bg-cyan-500/5" },
  dispatch:        { label: "Dispatch tool",    icon: Wrench,          tone: "border-indigo-500/40 bg-indigo-500/5" },
  "transfer-agent": { label: "Transfer agent",  icon: ArrowRightLeft,  tone: "border-amber-500/40 bg-amber-500/5" },
  "transfer-number": { label: "Transfer to number", icon: Phone,       tone: "border-amber-500/40 bg-amber-500/5" },
  end:             { label: "End",              icon: PhoneOff,        tone: "border-emerald-500/40 bg-emerald-500/5" },
};

function WorkflowNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;
  const isTerminal = data.kind === "end" || data.kind === "transfer-number";
  return (
    <WfNode
      handles={{ target: true, source: !isTerminal }}
      className={cn(meta.tone, selected && "ring-2 ring-primary/60")}
    >
      <NodeHeader>
        <div className="flex items-center justify-between gap-2">
          <NodeTitle className="text-[13px]">{data.title}</NodeTitle>
          <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wide">
            <Icon size={11} /> {meta.label}
          </Badge>
        </div>
        {data.description && (
          <NodeDescription className="line-clamp-2 text-[12px]">{data.description}</NodeDescription>
        )}
      </NodeHeader>

      {data.kind === "subagent" && (
        <NodeContent className="grid gap-2 text-[12px]">
          {data.prompt && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Prompt
              </div>
              <div className="mt-0.5 line-clamp-2 text-foreground">{data.prompt}</div>
            </div>
          )}
          {data.llmOverride && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">LLM:</span>
              <Badge variant="outline" className="font-mono text-[10px]">{data.llmOverride}</Badge>
            </div>
          )}
          {data.tools && data.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.tools.map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-[10px]">{t}</Badge>
              ))}
            </div>
          )}
        </NodeContent>
      )}

      {data.kind === "extraction" && (
        <NodeContent className="grid gap-2 text-[12px]">
          {data.prompt && (
            <div className="line-clamp-2 text-foreground">{data.prompt}</div>
          )}
          {data.extraction && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Required fields
              </div>
              <div className="flex flex-wrap gap-1">
                {data.extraction.requiredFields.map((f) => (
                  <Badge key={f} variant="outline" className="font-mono text-[10px]">{f}</Badge>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
                <span>max turns: <span className="text-foreground">{data.extraction.maxTurns}</span></span>
                <span>mode: <span className="text-foreground">{data.extraction.promptMode}</span></span>
              </div>
            </>
          )}
        </NodeContent>
      )}

      {data.kind === "dispatch" && (
        <NodeContent className="grid gap-1 text-[12px]">
          <div className="flex items-center gap-2">
            <Wrench size={11} className="text-muted-foreground" />
            <span className="font-mono text-[11px]">{data.toolName ?? "tool_name"}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">Routes <strong>success</strong> and <strong>failure</strong> separately.</div>
        </NodeContent>
      )}

      {(data.kind === "transfer-agent" || data.kind === "transfer-number") && (
        <NodeContent className="text-[12px]">
          <div className="text-[11px] text-muted-foreground">Hand off to</div>
          <div className="mt-0.5 font-mono text-[12px]">{data.transferTo}</div>
        </NodeContent>
      )}

      {data.kind === "end" && (
        <NodeContent className="text-[12px] text-muted-foreground">Graceful termination — fires post-call webhooks.</NodeContent>
      )}
    </WfNode>
  );
}

const nodeTypes = { workflow: WorkflowNode };
const edgeTypes = { animated: WfEdge.Animated, temporary: WfEdge.Temporary };

// ---------- edge / condition model ---------------------------------------

interface EdgeData extends Record<string, unknown> {
  conditionType: "llm" | "expression" | "none";
  label?: string;
}

function makeAnimatedEdge(id: string, source: string, target: string, edgeData: EdgeData): EdgeType<EdgeData> {
  return {
    id,
    source,
    target,
    type: "animated",
    label: edgeData.label,
    style: { stroke: "var(--primary)", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
    data: edgeData,
  };
}

// ---------- sample workflow (extraction-node-demo from AriaFlow) ---------
//
// Mirrors `ariaflow-core/examples/flows/extraction-node-demo.ts`:
//   greeting → collect_info (ExtractionNode {name, phone, reason}) → confirm → end
// Plus an LLM-conditioned escalate branch out of `collect_info` so the
// canvas shows real-world fan-out.

function sampleNodes(): NodeType<NodeData>[] {
  return [
    {
      id: "greeting",
      type: "workflow",
      position: { x: 80, y: 200 },
      data: {
        kind: "subagent",
        title: "Greeting",
        description: "Greet the caller; route into intake immediately.",
        prompt: "Greet the caller and ask how you can help them today. Immediately transition to collect_info.",
        llmOverride: "gpt-4o-mini",
        tools: ["start_collection"],
      },
    },
    {
      id: "collect_info",
      type: "workflow",
      position: { x: 440, y: 200 },
      data: {
        kind: "extraction",
        title: "Collect contact info",
        description: "Loops until name, phone, and reason all parse against the Zod schema.",
        prompt: "You are a friendly receptionist collecting contact information from the caller.",
        llmOverride: "gpt-4o-mini",
        extraction: {
          requiredFields: ["name", "phone", "reason"],
          schema:
            "z.object({\n  name: z.string().min(1),\n  phone: z.string().min(7),\n  reason: z.string().min(1),\n})",
          maxTurns: 8,
          completeTransition: "confirm",
          promptMode: "llm",
        },
      },
    },
    {
      id: "escalate",
      type: "workflow",
      position: { x: 440, y: 460 },
      data: {
        kind: "transfer-number",
        title: "Escalate to human",
        description: "Caller hostile, asked for a person, or extraction stalled past max turns.",
        transferTo: "+1 206 555 0188",
      },
    },
    {
      id: "confirm",
      type: "workflow",
      position: { x: 800, y: 200 },
      data: {
        kind: "subagent",
        title: "Confirm",
        description: "Read back name / phone / reason and ask if everything is correct.",
        prompt:
          "Review the collected information and confirm with the caller:\n- Name: {{name}}\n- Phone: {{phone}}\n- Reason: {{reason}}\n\nAsk if everything is correct.",
        llmOverride: "gpt-4o-mini",
        tools: ["confirmed"],
      },
    },
    {
      id: "end",
      type: "workflow",
      position: { x: 1140, y: 200 },
      data: {
        kind: "end",
        title: "End call",
        description: "Thank the caller and let them know someone will be in touch.",
      },
    },
  ];
}

function sampleEdges(): EdgeType<EdgeData>[] {
  return [
    makeAnimatedEdge("e-greeting-collect", "greeting", "collect_info", {
      conditionType: "none",
      label: "start_collection",
    }),
    makeAnimatedEdge("e-collect-confirm", "collect_info", "confirm", {
      conditionType: "expression",
      label: "schema satisfied (name AND phone AND reason)",
    }),
    makeAnimatedEdge("e-collect-escalate", "collect_info", "escalate", {
      conditionType: "llm",
      label: "caller hostile or asked for human",
    }),
    makeAnimatedEdge("e-confirm-end", "confirm", "end", {
      conditionType: "none",
      label: "confirmed",
    }),
  ];
}

// ---------- the tab ------------------------------------------------------

const NODE_TEMPLATES: { kind: NodeKind; title: string; description: string }[] = [
  { kind: "subagent", title: "Subagent", description: "Override prompt / LLM / voice / tools for one phase." },
  { kind: "extraction", title: "Extraction", description: "Loop until a Zod schema is fully satisfied. Auto-transitions on success." },
  { kind: "dispatch", title: "Dispatch tool", description: "Force a tool call; route success and failure separately." },
  { kind: "transfer-agent", title: "Transfer agent", description: "Hand the call to another conversational agent." },
  { kind: "transfer-number", title: "Transfer to number", description: "Bridge the caller to a human via PSTN." },
  { kind: "end", title: "End", description: "Graceful termination + post-call webhooks." },
];

function WorkflowTab() {
  const { agentId } = Route.useParams();
  const agents = useMemo(() => makeAgents(10), []);
  const seed = agents.find((a) => a.id === agentId) ?? agents[0]!;

  const [nodes, setNodes] = useState<NodeType<NodeData>[]>(() => sampleNodes());
  const [edges, setEdges] = useState<EdgeType<EdgeData>[]>(() => sampleEdges());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const onNodesChange: ReactFlowProps["onNodesChange"] = useCallback(
    (changes) => setNodes((ns) => applyNodeChanges(changes, ns) as NodeType<NodeData>[]),
    [],
  );
  const onEdgesChange: ReactFlowProps["onEdgesChange"] = useCallback(
    (changes) => setEdges((es) => applyEdgeChanges(changes, es) as EdgeType<EdgeData>[]),
    [],
  );
  const onConnect: ReactFlowProps["onConnect"] = useCallback(
    (params) =>
      setEdges((es) =>
        addEdge(
          makeAnimatedEdge(`e-${params.source}-${params.target}`, params.source!, params.target!, {
            conditionType: "none",
          }),
          es,
        ),
      ),
    [],
  );

  function addNodeFromTemplate(kind: NodeKind) {
    const id = `${kind}-${Math.random().toString(36).slice(2, 7)}`;
    const tpl: NodeData = {
      kind,
      title: KIND_META[kind].label,
      description: NODE_TEMPLATES.find((t) => t.kind === kind)?.description,
      ...(kind === "extraction" && {
        extraction: {
          requiredFields: ["field_a", "field_b"],
          schema: "z.object({ field_a: z.string(), field_b: z.string() })",
          maxTurns: 6,
          completeTransition: "next_node",
          promptMode: "llm" as const,
        },
        prompt: "Collect the required fields naturally.",
      }),
      ...(kind === "dispatch" && { toolName: "tool_name" }),
      ...(kind === "transfer-agent" && { transferTo: "another-agent-id" }),
      ...(kind === "transfer-number" && { transferTo: "+1 555 000 0000" }),
    };
    setNodes((ns) => [
      ...ns,
      { id, type: "workflow", position: { x: 200 + ns.length * 40, y: 540 }, data: tpl },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }

  const [originalNodes] = useState(() => sampleNodes());
  const [originalEdges] = useState(() => sampleEdges());
  const dirty =
    nodes.length !== originalNodes.length ||
    edges.length !== originalEdges.length ||
    JSON.stringify(nodes.map((n) => n.data)) !== JSON.stringify(originalNodes.map((n) => n.data)) ||
    JSON.stringify(edges.map((e) => e.data)) !== JSON.stringify(originalEdges.map((e) => e.data));
  const changes = dirty ? 1 : 0;

  function reset() {
    setNodes(sampleNodes());
    setEdges(sampleEdges());
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  function patchNode(id: string, patch: Partial<NodeData>) {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }

  function patchExtraction(id: string, patch: Partial<NonNullable<NodeData["extraction"]>>) {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id && n.data.extraction
          ? { ...n, data: { ...n.data, extraction: { ...n.data.extraction, ...patch } } }
          : n,
      ),
    );
  }

  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  }

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={reset}
    >
      <div className="-mx-8 -my-8 grid h-[calc(100svh-3.5rem-4rem-105px)] grid-cols-[1fr_360px]">
        <div className="relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-muted/30"
          >
            <Background gap={16} size={1} />
            <Controls position="bottom-right" />
            <WfPanel position="top-left">
              <div className="flex flex-col gap-1 p-1">
                <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Add node
                </div>
                {NODE_TEMPLATES.map((t) => {
                  const Icon = KIND_META[t.kind].icon;
                  return (
                    <button
                      key={t.kind}
                      onClick={() => addNodeFromTemplate(t.kind)}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-muted"
                    >
                      <Icon size={13} />
                      <span>{t.title}</span>
                    </button>
                  );
                })}
              </div>
            </WfPanel>
          </ReactFlow>
        </div>

        <aside className="overflow-auto border-l bg-card">
          {selectedNode ? (
            <NodeInspector
              node={selectedNode}
              onPatch={(patch) => patchNode(selectedNode.id, patch)}
              onPatchExtraction={(patch) => patchExtraction(selectedNode.id, patch)}
              onDelete={() => deleteNode(selectedNode.id)}
              onClose={() => setSelectedNodeId(null)}
            />
          ) : selectedEdge ? (
            <EdgeInspector
              edge={selectedEdge}
              onChange={(next) =>
                setEdges((es) =>
                  es.map((e) => (e.id === selectedEdge.id ? { ...e, data: next, label: next.label } : e)),
                )
              }
              onDelete={() => {
                setEdges((es) => es.filter((e) => e.id !== selectedEdge.id));
                setSelectedEdgeId(null);
              }}
              onClose={() => setSelectedEdgeId(null)}
            />
          ) : (
            <EmptyInspector nodeCount={nodes.length} edgeCount={edges.length} />
          )}
        </aside>
      </div>
    </AgentEditorShell>
  );
}

// ---------- inspectors ---------------------------------------------------

function InspectorHeader({
  title,
  subtitle,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b p-5">
      <div>
        <Eyebrow>{title}</Eyebrow>
        {subtitle && (
          <div className="mt-0.5 font-mono text-[12px] tabular-nums text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close inspector">
        <X size={14} />
      </Button>
    </div>
  );
}

function NodeInspector({
  node,
  onPatch,
  onPatchExtraction,
  onDelete,
  onClose,
}: {
  node: NodeType<NodeData>;
  onPatch: (patch: Partial<NodeData>) => void;
  onPatchExtraction: (patch: Partial<NonNullable<NodeData["extraction"]>>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = KIND_META[node.data.kind];
  const Icon = meta.icon;
  return (
    <>
      <InspectorHeader title="Node" subtitle={`${node.id} · ${meta.label}`} onClose={onClose} />
      <div className="grid gap-4 p-5">
        <div className="flex items-center gap-2 text-[12px]">
          <Icon size={14} />
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {meta.label}
          </Badge>
        </div>

        <Field>
          <FieldLabel htmlFor={`title-${node.id}`}>Title</FieldLabel>
          <Input
            id={`title-${node.id}`}
            value={node.data.title}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`desc-${node.id}`}>Description</FieldLabel>
          <Textarea
            id={`desc-${node.id}`}
            value={node.data.description ?? ""}
            onChange={(e) => onPatch({ description: e.target.value })}
            className="min-h-[64px] text-[12px]"
            placeholder="One-line summary of this phase."
          />
        </Field>

        {(node.data.kind === "subagent" || node.data.kind === "extraction") && (
          <>
            <Field>
              <FieldLabel htmlFor={`prompt-${node.id}`}>Prompt</FieldLabel>
              <Textarea
                id={`prompt-${node.id}`}
                value={node.data.prompt ?? ""}
                onChange={(e) => onPatch({ prompt: e.target.value })}
                className="min-h-[120px] font-mono text-[12px]"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`llm-${node.id}`}>LLM override</FieldLabel>
              <Input
                id={`llm-${node.id}`}
                value={node.data.llmOverride ?? ""}
                onChange={(e) => onPatch({ llmOverride: e.target.value })}
                placeholder="inherit from agent"
                className="font-mono text-[12px]"
              />
            </Field>
          </>
        )}

        {node.data.kind === "subagent" && (
          <Field>
            <FieldLabel>Tools</FieldLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {(node.data.tools ?? []).map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="gap-1 font-mono text-[10px]"
                >
                  {t}
                  <button
                    aria-label={`Remove ${t}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onPatch({ tools: (node.data.tools ?? []).filter((x) => x !== t) })}
                  >
                    <X size={10} />
                  </button>
                </Badge>
              ))}
              <button
                onClick={() =>
                  onPatch({
                    tools: [...(node.data.tools ?? []), `tool_${(node.data.tools?.length ?? 0) + 1}`],
                  })
                }
                className="rounded-md border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                + add tool
              </button>
            </div>
          </Field>
        )}

        {node.data.kind === "extraction" && node.data.extraction && (
          <>
            <Field>
              <FieldLabel>Required fields</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {node.data.extraction.requiredFields.map((f) => (
                  <Badge key={f} variant="outline" className="gap-1 font-mono text-[10px]">
                    {f}
                    <button
                      aria-label={`Remove ${f}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        onPatchExtraction({
                          requiredFields: node.data.extraction!.requiredFields.filter((x) => x !== f),
                        })
                      }
                    >
                      <X size={10} />
                    </button>
                  </Badge>
                ))}
                <button
                  onClick={() =>
                    onPatchExtraction({
                      requiredFields: [
                        ...node.data.extraction!.requiredFields,
                        `field_${node.data.extraction!.requiredFields.length + 1}`,
                      ],
                    })
                  }
                  className="rounded-md border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  + add field
                </button>
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor={`schema-${node.id}`}>Zod schema</FieldLabel>
              <Textarea
                id={`schema-${node.id}`}
                value={node.data.extraction.schema}
                onChange={(e) => onPatchExtraction({ schema: e.target.value })}
                className="min-h-[120px] font-mono text-[11px]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor={`maxturns-${node.id}`}>Max turns</FieldLabel>
                <Input
                  id={`maxturns-${node.id}`}
                  type="number"
                  min={1}
                  max={20}
                  value={node.data.extraction.maxTurns}
                  onChange={(e) => onPatchExtraction({ maxTurns: Number(e.target.value) })}
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`mode-${node.id}`}>Prompt mode</FieldLabel>
                <select
                  id={`mode-${node.id}`}
                  value={node.data.extraction.promptMode}
                  onChange={(e) =>
                    onPatchExtraction({ promptMode: e.target.value as "llm" | "deterministic" })
                  }
                  className="h-9 w-full rounded-md border bg-background px-2 font-mono text-[12px]"
                >
                  <option value="llm">llm</option>
                  <option value="deterministic">deterministic</option>
                </select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`complete-${node.id}`}>On complete → transition to</FieldLabel>
              <Input
                id={`complete-${node.id}`}
                value={node.data.extraction.completeTransition}
                onChange={(e) => onPatchExtraction({ completeTransition: e.target.value })}
                placeholder="next_node_id"
                className="font-mono text-[12px]"
              />
            </Field>
          </>
        )}

        {node.data.kind === "dispatch" && (
          <Field>
            <FieldLabel htmlFor={`tool-${node.id}`}>Tool name</FieldLabel>
            <Input
              id={`tool-${node.id}`}
              value={node.data.toolName ?? ""}
              onChange={(e) => onPatch({ toolName: e.target.value })}
              className="font-mono text-[12px]"
              placeholder="service_titan.search_techs"
            />
          </Field>
        )}

        {(node.data.kind === "transfer-agent" || node.data.kind === "transfer-number") && (
          <Field>
            <FieldLabel htmlFor={`xfer-${node.id}`}>
              {node.data.kind === "transfer-agent" ? "Target agent ID" : "Target phone number"}
            </FieldLabel>
            <Input
              id={`xfer-${node.id}`}
              value={node.data.transferTo ?? ""}
              onChange={(e) => onPatch({ transferTo: e.target.value })}
              className="font-mono text-[12px]"
              placeholder={node.data.kind === "transfer-agent" ? "ag_a07" : "+1 206 555 0188"}
            />
          </Field>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" disabled className="gap-1.5">
            <Play size={12} /> Test from here
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            Delete node
          </Button>
        </div>
      </div>
    </>
  );
}

function EdgeInspector({
  edge,
  onChange,
  onDelete,
  onClose,
}: {
  edge: EdgeType<EdgeData>;
  onChange: (next: EdgeData) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const data = edge.data ?? { conditionType: "none" };
  return (
    <>
      <InspectorHeader title="Edge condition" subtitle={`${edge.source} → ${edge.target}`} onClose={onClose} />
      <div className="grid gap-3 p-5">
        {(["llm", "expression", "none"] as const).map((t) => (
          <label
            key={t}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-md border bg-background px-3 py-2 text-[12px]",
              data.conditionType === t && "border-primary bg-primary/5",
            )}
          >
            <input
              type="radio"
              checked={data.conditionType === t}
              onChange={() => onChange({ ...data, conditionType: t })}
              className="mt-0.5 h-3.5 w-3.5 accent-primary"
            />
            <div>
              <div className="font-medium capitalize">
                {t === "none" ? "Unconditional" : t === "llm" ? "LLM-evaluated" : "Expression"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t === "llm"
                  ? "Natural-language gate scored by the LLM each turn."
                  : t === "expression"
                    ? "Deterministic check over dynamic variables / extracted fields."
                    : "Auto-progress as soon as the source node completes."}
              </div>
            </div>
          </label>
        ))}
        {data.conditionType !== "none" && (
          <Field>
            <FieldLabel>{data.conditionType === "llm" ? "Natural-language label" : "Expression"}</FieldLabel>
            <Input
              value={data.label ?? ""}
              onChange={(e) => onChange({ ...data, label: e.target.value })}
              className="font-mono text-[12px]"
              placeholder={
                data.conditionType === "llm"
                  ? "e.g. caller stated their reason"
                  : "e.g. zip_captured AND window_captured"
              }
            />
          </Field>
        )}
        <div className="mt-2 flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            Delete edge
          </Button>
        </div>
      </div>
    </>
  );
}

function EmptyInspector({ nodeCount, edgeCount }: { nodeCount: number; edgeCount: number }) {
  return (
    <>
      <div className="border-b p-5">
        <Eyebrow>Workflow</Eyebrow>
        <h2 className="mt-1 font-display text-[18px] font-semibold">Graph editor</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Click any node or edge to edit it. Drag from a node's right handle to wire a new edge.
        </p>
      </div>
      <div className="p-5">
        <Eyebrow>Tip</Eyebrow>
        <ul className="mt-2 grid gap-2 text-[12px] text-muted-foreground">
          <li>· Click a node → edit prompt, LLM, tools, extraction schema.</li>
          <li>· Click an edge → switch the condition (LLM / expression / none).</li>
          <li>· Drag a node's right handle onto another node to connect.</li>
          <li>· Use the toolbar (top-left) to add new nodes.</li>
        </ul>
        <div className="mt-5 grid gap-1 text-[11px]">
          <div className="font-semibold text-foreground">Stats</div>
          <div className="text-muted-foreground">
            {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge{edgeCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </>
  );
}
