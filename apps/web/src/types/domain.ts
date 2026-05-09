export type Vertical = "home-services" | "appointment-services" | "education";

export type Environment = "production" | "staging" | "sandbox";

export type Region = "us-east-1" | "us-west-2" | "eu-west-1";

export type LlmProvider = "openai" | "anthropic" | "google";

export type ComplianceMode = "none" | "hipaa" | "ferpa" | "tcpa";

export type AgentStatus = "live" | "paused" | "draft" | "archived";

/** STT-LLM-TTS pipeline = three swappable models in sequence.
 *  Realtime = a single multimodal model handles both reasoning and speech. */
export type PipelineMode = "stt-llm-tts" | "realtime";

export type ReasoningEffort = "low" | "medium" | "high";

export interface AgentTtsConfig {
  model: string;
  voiceId: string;
  voiceName: string;
  language: string;
}

export interface AgentSttConfig {
  model: string;
  language: string;
}

export interface AgentRealtimeConfig {
  model: string;
  voiceId: string;
  voiceName: string;
  /** Some realtime providers require the user's own API key (xAI, OpenAI). */
  requiresByokSecret?: string;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  llmProvider: LlmProvider;
  llmModel: string;
  voiceId: string;
  voiceName: string;
  language: string;
  complianceMode: ComplianceMode;
  calls7d: number;
  bookingRate: number;
  costPerCall: number;
  createdAt: string;
  updatedAt: string;
  /** First-message + system prompt — owned by the C2 Behavior tab. */
  firstMessage: string;
  systemPrompt: string;
  temperature: number;
  /** Short description — used when this agent is consumed by another agent
   *  via `agent.asTool()`, or surfaced in the Triage / Workflow picker. */
  description: string;
  /** Maximum tool-call iterations before the agent must yield to the user.
   *  Maps to AriaFlow's `Agent.maxSteps`. */
  maxSteps: number;

  /** "Models & Voice" tab state — modelled on LiveKit's pipeline-mode toggle. */
  pipelineMode: PipelineMode;
  reasoningEffort: ReasoningEffort;
  tts: AgentTtsConfig;
  stt: AgentSttConfig;
  realtime: AgentRealtimeConfig;
  /** Audio-pipeline accessories (apply in both pipeline modes). */
  noiseCancellation: string;
  backgroundAudio: string;
}

export type ConversationOutcome =
  | "booked"
  | "qualified"
  | "missed"
  | "voicemail"
  | "abandoned"
  | "escalated";

export type ConversationDirection = "inbound" | "outbound";

export interface ConversationTurn {
  id: string;
  speaker: "agent" | "caller";
  text: string;
  timestampSec: number;
  createdAt: string;
  evalVerdict?: "passed" | "failed" | "warning";
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  durationMs: number;
}

export interface Conversation {
  id: string;
  agentId: string;
  agentName: string;
  direction: ConversationDirection;
  callerId: string;
  callerName: string | null;
  startedAt: string;
  durationSec: number;
  outcome: ConversationOutcome;
  isLive: boolean;
  recordingUrl: string | null;
  transcript: ConversationTurn[];
  topics: string[];
  evalsPassed: number;
  evalsTotal: number;
  extractedFields: { label: string; value: string }[];
  costUsd: number;
}

export type BatchStatus = "draft" | "scheduled" | "running" | "paused" | "completed" | "failed";

export interface Batch {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  status: BatchStatus;
  totalRecipients: number;
  completed: number;
  booked: number;
  failed: number;
  scheduledFor: string | null;
  costUsd: number;
  recoveredRevenueUsd: number;
  vertical: Vertical;
}

export interface PhoneNumber {
  id: string;
  number: string;
  provider: "twilio-native" | "twilio-byo" | "sip";
  region: string;
  attachedAgentId: string | null;
  recording: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  vertical: Vertical;
  environment: Environment;
  region: Region;
  members: number;
  /** Compliance posture per regulation. */
  compliance: {
    hipaa: ComplianceState;
    ferpa: ComplianceState;
    tcpa: ComplianceState;
    euAiAct: ComplianceState;
  };
}

export type ComplianceState = "active" | "action-required" | "violation" | "inactive";

export interface KpiTilePoint {
  label: string;
  value: number;
  /** Receipt Gold formatting for currency values; toggle via `currency`. */
  currency?: boolean;
  /** Compared to last 7-day period. null when no baseline exists. */
  delta: number | null;
  /** Sparkline series (count = 14). */
  spark: number[];
  /** Render as live/streaming with Live Cyan. */
  live?: boolean;
}

export interface RoiReceipt {
  month: string;
  recoveredRevenueUsd: number;
  roiMultiplier: number;
  costUsd: number;
  perAgent: { agentName: string; recovered: number; calls: number }[];
  comparisonDeltaPct: number;
}
