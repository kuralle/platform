import "@xyflow/react/dist/style.css";

import { Badge } from "@kuralle/ui/components/badge";
import { Button } from "@kuralle/ui/components/button";
import { Eyebrow } from "@kuralle/ui/components/eyebrow";
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
import { ArrowRightLeft, GitBranch, Phone, PhoneOff, Plus, Sparkles, Wrench } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AgentEditorShell } from "@/components/configure/agent-editor-shell";
import { Controls } from "@/components/workflow/controls";
import { Edge as WfEdge } from "@/components/workflow/edge";
import {
  Node as WfNode,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from "@/components/workflow/node";
import { Panel as WfPanel } from "@/components/workflow/panel";
import { makeAgents } from "@/mocks";

export const Route = createFileRoute("/_app/agents/$agentId/workflow")({
  component: WorkflowTab,
});

// ---------- node types ----------------------------------------------------

interface NodeData extends Record<string, unknown> {
  kind: "subagent" | "dispatch" | "transfer-agent" | "transfer-number" | "end";
  title: string;
  description?: string;
  promptOverride?: string;
  llmOverride?: string;
  toolName?: string;
  transferTo?: string;
  /** Tools available at this node (subagent only). */
  tools?: string[];
}

const KIND_META: Record<NodeData["kind"], { label: string; icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  subagent:        { label: "Subagent",       icon: Sparkles,        tone: "border-primary/40 bg-primary/5" },
  dispatch:        { label: "Dispatch tool",  icon: Wrench,          tone: "border-indigo-500/40 bg-indigo-500/5" },
  "transfer-agent": { label: "Transfer agent", icon: ArrowRightLeft, tone: "border-amber-500/40 bg-amber-500/5" },
  "transfer-number": { label: "Transfer to number", icon: Phone,     tone: "border-amber-500/40 bg-amber-500/5" },
  end:             { label: "End",            icon: PhoneOff,        tone: "border-emerald-500/40 bg-emerald-500/5" },
};

function WorkflowNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const meta = KIND_META[data.kind];
  const Icon = meta.icon;
  const isTerminal = data.kind === "end" || data.kind === "transfer-number";
  return (
    <WfNode
      handles={{ target: true, source: !isTerminal }}
      className={cn(meta.tone, selected && "ring-2 ring-primary/40")}
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
          {data.promptOverride && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Prompt override
              </div>
              <div className="mt-0.5 line-clamp-2 text-foreground">{data.promptOverride}</div>
            </div>
          )}
          {data.llmOverride && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">LLM:</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {data.llmOverride}
              </Badge>
            </div>
          )}
          {data.tools && data.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.tools.map((t) => (
                <Badge key={t} variant="outline" className="font-mono text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
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

// ---------- sample workflow ----------------------------------------------

function sampleNodes(): NodeType<NodeData>[] {
  return [
    {
      id: "greet",
      type: "workflow",
      position: { x: 80, y: 160 },
      data: {
        kind: "subagent",
        title: "Greet caller",
        description: "Warm greeting + confirm reason for the call.",
        promptOverride: "Open with brand name. Stay under 18 words. Confirm the reason for the call before doing anything else.",
        llmOverride: "claude-haiku-4-5",
      },
    },
    {
      id: "verify",
      type: "workflow",
      position: { x: 420, y: 160 },
      data: {
        kind: "subagent",
        title: "Verify identity",
        description: "Collect zip + service window for triage.",
        promptOverride: "Ask for zip code and earliest service window. Do not quote pricing.",
        llmOverride: "claude-sonnet-4-6",
        tools: ["collect_zip", "collect_window"],
      },
    },
    {
      id: "dispatch",
      type: "workflow",
      position: { x: 760, y: 60 },
      data: {
        kind: "dispatch",
        title: "Search techs",
        description: "Required tool call — must succeed before booking.",
        toolName: "service_titan.search_techs",
      },
    },
    {
      id: "human-handoff",
      type: "workflow",
      position: { x: 760, y: 280 },
      data: {
        kind: "transfer-number",
        title: "Escalate to dispatcher",
        description: "Hostile caller or after-hours emergency.",
        transferTo: "+1 206 555 0188",
      },
    },
    {
      id: "resolve",
      type: "workflow",
      position: { x: 1100, y: 60 },
      data: {
        kind: "subagent",
        title: "Confirm + book",
        description: "Read back details, send SMS confirmation.",
        promptOverride: "Read back the full booking. Tell the caller they'll get a text in a moment.",
        llmOverride: "claude-sonnet-4-6",
        tools: ["service_titan.create_job"],
      },
    },
    {
      id: "end",
      type: "workflow",
      position: { x: 1440, y: 60 },
      data: {
        kind: "end",
        title: "End call",
      },
    },
  ];
}

function sampleEdges(): EdgeType<EdgeData>[] {
  return [
    makeAnimatedEdge("e-greet-verify", "greet", "verify", {
      conditionType: "llm",
      label: "caller stated reason",
    }),
    makeAnimatedEdge("e-verify-dispatch", "verify", "dispatch", {
      conditionType: "expression",
      label: "zip captured AND window captured",
    }),
    makeAnimatedEdge("e-verify-handoff", "verify", "human-handoff", {
      conditionType: "llm",
      label: "caller hostile or asked for human",
    }),
    makeAnimatedEdge("e-dispatch-resolve", "dispatch", "resolve", {
      conditionType: "none",
      label: "success",
    }),
    makeAnimatedEdge("e-dispatch-handoff", "dispatch", "human-handoff", {
      conditionType: "expression",
      label: "tool failure",
    }),
    makeAnimatedEdge("e-resolve-end", "resolve", "end", {
      conditionType: "none",
    }),
  ];
}

// ---------- the tab ------------------------------------------------------

const NODE_TEMPLATES: { kind: NodeData["kind"]; title: string; description: string }[] = [
  { kind: "subagent", title: "Subagent", description: "Override prompt / LLM / voice / tools for one phase." },
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

  function addNodeFromTemplate(kind: NodeData["kind"]) {
    const id = `${kind}-${Math.random().toString(36).slice(2, 7)}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "workflow",
        position: { x: 200 + ns.length * 40, y: 480 },
        data: {
          kind,
          title: KIND_META[kind].label,
          description: NODE_TEMPLATES.find((t) => t.kind === kind)?.description,
        },
      },
    ]);
  }

  const [originalNodes] = useState(() => sampleNodes());
  const [originalEdges] = useState(() => sampleEdges());
  const dirty =
    nodes.length !== originalNodes.length ||
    edges.length !== originalEdges.length ||
    JSON.stringify(nodes.map((n) => n.data)) !== JSON.stringify(originalNodes.map((n) => n.data));
  const changes = dirty ? 1 : 0;

  function reset() {
    setNodes(sampleNodes());
    setEdges(sampleEdges());
    setSelectedEdgeId(null);
  }

  const selectedEdge = edges.find((e) => e.id === selectedEdgeId);

  return (
    <AgentEditorShell
      agentId={seed.id}
      agentName={seed.name}
      status={seed.status === "archived" ? "draft" : seed.status}
      changes={changes}
      onSave={() => undefined}
      onDiscard={reset}
    >
      <div className="-mx-8 -my-8 grid h-[calc(100svh-3.5rem-4rem-105px)] grid-cols-[1fr_320px]">
        <div className="relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
            onPaneClick={() => setSelectedEdgeId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-muted/30"
          >
            <Background gap={16} size={1} className="!bg-muted/30" />
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

        <aside className="border-l bg-card overflow-auto">
          <div className="p-5">
            <Eyebrow>Workflow</Eyebrow>
            <h2 className="mt-1 font-display text-[18px] font-semibold">Graph editor</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Each node is a sub-agent that can override prompt, LLM, voice, and tools for one phase. Edges carry
              conditions that gate progression.
            </p>
          </div>
          {selectedEdge ? (
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
            />
          ) : (
            <div className="border-t p-5">
              <Eyebrow>Tip</Eyebrow>
              <ul className="mt-2 grid gap-2 text-[12px] text-muted-foreground">
                <li>· Click a node to select it; drag to reposition.</li>
                <li>· Drag from a right-side handle onto another node to connect.</li>
                <li>· Click an edge to set its condition (LLM / expression / none).</li>
                <li>· Use the toolbar (top-left) to add new nodes.</li>
              </ul>
              <div className="mt-5 grid gap-1 text-[11px]">
                <div className="font-semibold text-foreground">Stats</div>
                <div className="text-muted-foreground">
                  {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} edge{edges.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </AgentEditorShell>
  );
}

function EdgeInspector({
  edge,
  onChange,
  onDelete,
}: {
  edge: EdgeType<EdgeData>;
  onChange: (next: EdgeData) => void;
  onDelete: () => void;
}) {
  const data = edge.data ?? { conditionType: "none" };
  return (
    <div className="border-t p-5">
      <Eyebrow>Edge condition</Eyebrow>
      <div className="mt-1 font-mono text-[12px] tabular-nums text-muted-foreground">
        {edge.source} → {edge.target}
      </div>
      <div className="mt-3 grid gap-1">
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
      </div>
      {data.conditionType !== "none" && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {data.conditionType === "llm" ? "Natural-language label" : "Expression"}
          </div>
          <input
            value={data.label ?? ""}
            onChange={(e) => onChange({ ...data, label: e.target.value })}
            className="mt-1 h-8 w-full rounded-md border bg-background px-2 font-mono text-[12px]"
            placeholder={
              data.conditionType === "llm"
                ? "e.g. caller stated their reason"
                : "e.g. zip_captured AND window_captured"
            }
          />
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          Delete edge
        </Button>
      </div>
    </div>
  );
}
