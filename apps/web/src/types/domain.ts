export type Vertical = "home-services" | "appointment-services" | "education";

export type Environment = "production" | "staging" | "sandbox";

export type Region = "us-east-1" | "us-west-2" | "eu-west-1";

export type LlmProvider = "openai" | "anthropic" | "google";

export type ComplianceMode = "none" | "hipaa" | "ferpa" | "tcpa";

export type AgentStatus = "live" | "paused" | "draft" | "archived";

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
  /** Compared to last 7-day period. */
  delta: number;
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
