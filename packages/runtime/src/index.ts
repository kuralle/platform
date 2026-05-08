export { projectAgent } from "./projector/agent.js";
export type { AgentProjectionTx, ProjectionCounts } from "./projector/agent.js";
export { projectConversationEvent } from "./projector/conversation.js";
export type { RuntimeTx, ProjectionContext } from "./projector/conversation.js";
export { runProjectorWorker, defaultShardKeys } from "./projector/projector-worker.js";
export {
  recordSloViolation,
  SLO_PUBLISH_THRESHOLD_MS,
  SLO_PUBLISH_NAME,
  SLO_PROJECTOR_LAG_THRESHOLD_MS,
  SLO_PROJECTOR_LAG_NAME,
  SLO_WHATSAPP_E2E_THRESHOLD_MS,
  SLO_WHATSAPP_E2E_NAME,
} from "./instrumentation/slo.js";
export {
  createMetaWhatsAppClient,
  listPhoneNumbers,
  subscribeApp,
  unsubscribeApp,
  verifyHmac,
} from "./clients/index.js";
export type {
  MetaWhatsAppClientDeps,
  PhoneNumberInfo,
  ListPhoneNumbersOpts,
  SubscribeAppOpts,
  UnsubscribeAppOpts,
  VerifyHmacOpts,
} from "./clients/index.js";
export { mockMetaClient } from "./test-utils.js";
export {
  irToAgentConfig,
  buildHarnessHooks,
  messagingEventSchema,
} from "./adapter/index.js";
export type { AgentConfigOpts, HarnessHooksDeps, MessagingEvent } from "./adapter/index.js";
