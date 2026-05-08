import type { RepoDb } from "./types.js";
import type { KvStore } from "@kuralle/platform/interface";
import { AgentRepository } from "./agent.js";
import { AgentVersionRepository } from "./agent-version.js";
import { KbDocumentRepository } from "./kb-document.js";
import { ToolRepository } from "./tool.js";
import { ChannelRepository } from "./channel.js";
import { ConversationRepository } from "./conversation.js";
import { BatchRepository } from "./batch.js";
import { ComplianceRepository } from "./compliance.js";
import { UsageRepository } from "./usage.js";
import { WidgetRepository } from "./widget.js";
import { OnboardingRepository } from "./onboarding.js";
import { WorkspaceRepository } from "./workspace.js";

export { type RepoDb } from "./types.js";

export function withWorkspace(
  db: RepoDb,
  workspaceId: string,
  kvStore: KvStore,
) {
  return {
    agents: new AgentRepository(db, workspaceId, kvStore),
    agentVersions: new AgentVersionRepository(db, workspaceId, kvStore),
    kbDocuments: new KbDocumentRepository(db, workspaceId, kvStore),
    tools: new ToolRepository(db, workspaceId, kvStore),
    channels: new ChannelRepository(db, workspaceId, kvStore),
    conversations: new ConversationRepository(db, workspaceId, kvStore),
    batches: new BatchRepository(db, workspaceId),
    compliance: new ComplianceRepository(db, workspaceId),
    usage: new UsageRepository(db, workspaceId),
    widget: new WidgetRepository(db, workspaceId),
    onboarding: new OnboardingRepository(db, workspaceId),
    workspace: new WorkspaceRepository(db, workspaceId),
  };
}
