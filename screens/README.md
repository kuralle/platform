# Stitch screen exports

Static HTML/Tailwind exports pulled from the Vokari Stitch project
[`projects/13016096124796191681`](https://stitch.withgoogle.com/project/13016096124796191681).
These are the raw `htmlCode.downloadUrl` outputs — the input to the React conversion
step described in `.stitch/DEV-HANDOFF.md`.

**Status:** 32 of 38 screens pulled. 6 Sprint 4 screens are still pending refire
(see `.stitch/manifest.json`).

Source of truth for IDs / status: `../../.stitch/manifest.json` (sibling repo).
Frames marked ★ are persona-blocking.

## Sprint 1 — LAND

First-time user → empty home in <8 min.

| # | Frame | File |
|---|---|---|
| A1 | Sign in | [`sprint-1-land/A1-sign-in.html`](sprint-1-land/A1-sign-in.html) |
| A2 | Workspace shell | [`sprint-1-land/A2-workspace-shell.html`](sprint-1-land/A2-workspace-shell.html) |
| A3 | Onboarding wizard | [`sprint-1-land/A3-onboarding-wizard.html`](sprint-1-land/A3-onboarding-wizard.html) |
| A4 | Template gallery | [`sprint-1-land/A4-template-gallery.html`](sprint-1-land/A4-template-gallery.html) |
| A5 | Empty home | [`sprint-1-land/A5-empty-home.html`](sprint-1-land/A5-empty-home.html) |
| B1 | Today dashboard | [`sprint-1-land/B1-today-dashboard.html`](sprint-1-land/B1-today-dashboard.html) |
| M1 | Welcome modal | [`sprint-1-land/M1-welcome-modal.html`](sprint-1-land/M1-welcome-modal.html) |
| M2 | Compliance status modal | [`sprint-1-land/M2-compliance-status-modal.html`](sprint-1-land/M2-compliance-status-modal.html) |

## Sprint 2 — CONFIGURE

Build + compliance-gate + test agent.

| # | Frame | File |
|---|---|---|
| C1 | Agents list | [`sprint-2-configure/C1-agents-list.html`](sprint-2-configure/C1-agents-list.html) |
| C2 | Agent editor — Behavior | [`sprint-2-configure/C2-agent-editor-behavior.html`](sprint-2-configure/C2-agent-editor-behavior.html) |
| C3 | Agent editor — LLM | [`sprint-2-configure/C3-agent-editor-llm.html`](sprint-2-configure/C3-agent-editor-llm.html) |
| C4 | Agent editor — Voice | [`sprint-2-configure/C4-agent-editor-voice.html`](sprint-2-configure/C4-agent-editor-voice.html) |
| C8 ★ | Agent editor — Compliance | [`sprint-2-configure/C8-agent-editor-compliance.html`](sprint-2-configure/C8-agent-editor-compliance.html) |
| C10 ★ | Agent test drawer | [`sprint-2-configure/C10-agent-test-drawer.html`](sprint-2-configure/C10-agent-test-drawer.html) |
| M3 | Add document modal | [`sprint-2-configure/M3-add-document-modal.html`](sprint-2-configure/M3-add-document-modal.html) |
| M4 | Voice A/B comparator | [`sprint-2-configure/M4-voice-ab-comparator.html`](sprint-2-configure/M4-voice-ab-comparator.html) |
| M5 ★ | Native connector wizard | [`sprint-2-configure/M5-native-connector-wizard.html`](sprint-2-configure/M5-native-connector-wizard.html) |
| M6 | Disclosure script editor | [`sprint-2-configure/M6-disclosure-script-editor.html`](sprint-2-configure/M6-disclosure-script-editor.html) |

## Sprint 3 — OPERATE

Telephony + conversations + outbound.

| # | Frame | File |
|---|---|---|
| D1 | Telephony connectors | [`sprint-3-operate/D1-telephony-connectors.html`](sprint-3-operate/D1-telephony-connectors.html) |
| D2 | Phone numbers list | [`sprint-3-operate/D2-phone-numbers-list.html`](sprint-3-operate/D2-phone-numbers-list.html) |
| F1 | Conversations list | [`sprint-3-operate/F1-conversations-list.html`](sprint-3-operate/F1-conversations-list.html) |
| F2 ★ | Conversation detail | [`sprint-3-operate/F2-conversation-detail.html`](sprint-3-operate/F2-conversation-detail.html) |
| F3 | Live supervisor (DARK) | [`sprint-3-operate/F3-live-supervisor.html`](sprint-3-operate/F3-live-supervisor.html) |
| G1 | Outbound batches list | [`sprint-3-operate/G1-batches-list.html`](sprint-3-operate/G1-batches-list.html) |
| G2 | Batch create wizard | [`sprint-3-operate/G2-batch-create-wizard.html`](sprint-3-operate/G2-batch-create-wizard.html) |
| M7 | Number import wizard | [`sprint-3-operate/M7-number-import-wizard.html`](sprint-3-operate/M7-number-import-wizard.html) |
| M10 | Convert-to-test | [`sprint-3-operate/M10-convert-to-test.html`](sprint-3-operate/M10-convert-to-test.html) |
| M12 | Outbound flow library | [`sprint-3-operate/M12-outbound-flow-library.html`](sprint-3-operate/M12-outbound-flow-library.html) |

> F3 was pulled with `class="light"` on `<html>`. The handoff explicitly calls for
> Mission Black palette here — verify before converting to React.

## Sprint 4 — CLOSE

Govern + distribute + ROI receipt.

| # | Frame | File | Status |
|---|---|---|---|
| I1 | Workspace settings | [`sprint-4-close/I1-workspace-settings.html`](sprint-4-close/I1-workspace-settings.html) | ✓ |
| I4 | Compliance posture | [`sprint-4-close/I4-compliance-posture.html`](sprint-4-close/I4-compliance-posture.html) | ✓ |
| H1 | Widget customizer | [`sprint-4-close/H1-widget-customizer.html`](sprint-4-close/H1-widget-customizer.html) | ✓ |
| L5 ★ | Monthly ROI receipt PDF | [`sprint-4-close/L5-monthly-roi-receipt.html`](sprint-4-close/L5-monthly-roi-receipt.html) | ✓ |
| H2 | Embed snippet + landing | — | needs refire |
| L1 | Speed-to-Lead trigger console | — | needs refire |
| L4 ★ | Revenue Attribution dashboard | — | needs refire (PERSONA-BLOCKING) |
| L7 | Passive Intelligence digest | — | needs refire |
| M19 | Speed-to-Lead trigger setup | — | needs refire |
| M21 | Attribution outcome webhook | — | needs refire |

## Re-pulling

Each file's `htmlCode.downloadUrl` returned by the Stitch MCP is signed and
expires. To re-pull, call `mcp__stitch__get_screen` with the screen IDs from
`.stitch/manifest.json` and `curl` the fresh `downloadUrl`.
