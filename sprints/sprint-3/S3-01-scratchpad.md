# S3-01 Continuation Scratchpad

## Status: Implementation in progress

## Plan
1. ✅ Read all required files
2. Expand ChannelRepository (endpoint CRUD + findManyByWorkspaceFiltered)
3. Expand channel.test.ts
4. Update core re-exports
5. Update schemas (rename channelSchema → channelEndpointSchema, add channelConnectionSchema, availablePhoneNumberSchema)
6. Update context + env.ts shim
7. Update apps/server/src/index.ts
8. Replace channels router (5 procedures)
9. Create frontend hooks (channels.ts)
10. Rewrite telephony.ts + phone-numbers.ts
11. Integration test
12. OpenAPI + api-client regeneration
13. Demo artifact
14. Run full test chain
15. Commit

## Key API shapes verified
- `GraphAPIClient` (from @ariaflowagents/messaging-meta)
- `GraphAPIClientConfig = { accessToken, appSecret, apiVersion?, baseUrl?, retry?, rateLimiter?, logger? }`
- `verifySignature({ appSecret, rawBody, signatureHeader }): boolean`
- Thin client wraps: `createMetaWhatsAppClient`, `listPhoneNumbers`, `subscribeApp`, `unsubscribeApp`, `verifyHmac`

## Decisions
- Env flows through oRPC context (add env to Context)
- getEnv() reads process.env in all environments (Alchemy maps CF bindings to process.env)
- Secrets row stores meta credentials as JSON Buffer
- connect creates Meta client inside handler using getEnv() values
