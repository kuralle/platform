# S2-04 Scratchpad

## Plan

1. Create 5 new read-only hooks + tests
2. Extend agents.ts with 4 new hooks + tests
3. Create PublishConfirmationModal component
4. Rewrite `_app.agents.$agentId.tsx` to host AgentIR reducer + sticky bar with publish
5. Wire C2/C3/C8 to use real hooks + dispatch IR patches
6. Wire 5 mock-driven screens to real hooks
7. Click-through test
8. Verify: check-types, lint, test

## Findings

- `useTelephony` and `usePhoneNumbers` both wrap `$api.channels.list.useQuery` — no dedicated telephony/phoneNumbers routers exist. Flagging per brief.
- `StickySaveBar` exists in `@kuralle/ui/components/sticky-save-bar` — modified in place.
- The existing `AgentEditorShell` uses `StickySaveBar` via props. For the publish flow, need to build `PublishConfirmationModal` separately.
