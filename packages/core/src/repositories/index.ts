import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { AgentRepository } from "./agent.js";
import { AgentVersionRepository } from "./agent-version.js";
import { KbDocumentRepository } from "./kb-document.js";
import { ToolRepository } from "./tool.js";
import { ChannelRepository } from "./channel.js";
import { ConversationRepository } from "./conversation.js";

export function withWorkspace(
  db: NodePgDatabase<typeof schema>,
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
  };
}
