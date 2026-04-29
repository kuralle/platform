# Stitch screens → shadcn component map

For each generated screen, this maps the Stitch markup to shadcn/ui primitives in
`packages/ui/src/components/` and to prebuilt blocks from
[ui.shadcn.com/blocks](https://ui.shadcn.com/blocks) we can lift wholesale or
adapt.

**Rule of thumb:** prefer a shadcn block if it covers ≥70% of the screen. Drop
to primitives for the remaining 30%. The Stitch HTML is a visual brief — copy
the layout, not the markup.

---

## Reusable shadcn blocks (from ui.shadcn.com/blocks)

| Block | What it gives us | Where we use it |
|---|---|---|
| **dashboard-01** | Sidebar + KPI cards (`SectionCards`) + interactive area chart (`ChartAreaInteractive`) + data table (`DataTable`) + site header | A2 shell, B1 dashboard, F1, G1 — the entire authenticated app inherits this skeleton |
| **sidebar-07** | Collapsible icon-only sidebar (the LeftRail spec is 224px collapsing) | A2 LeftRail |
| **sidebar-08** | Inset sidebar with secondary nav | I1 settings sub-nav (General/Security/Webhooks/…) |
| **sidebar-14** | Right-side sidebar | F2 context rail, F3 customer-context rail, C10 test drawer when docked |
| **login-03** | Centered form on muted bg | A1 sign-in (extend with SSO buttons + compliance badges) |
| **chart-area-01** / **chart-line-01** | Interactive area/line chart | B1 KPI trend chart, L4 (when refired) |
| **chart-radial-01** | Circular progress/pie | G1 24px status-pie ring per row |
| **chart-pie-01** | Pie chart | I4 compliance posture per regulation |

The 48 primitives in `packages/ui/src/components/` we already installed cover
everything else.

---

## Sprint 1 · LAND

### A1 — Sign in (`/auth/sign-in`)
**Block:** `login-03` (muted bg, centered card).
**Primitives:** `card` · `button` (primary + 3 SSO variants) · `input` · `label` · `separator` (between SSO and email) · `badge` (SOC 2 / HIPAA / FERPA pills).
**Notes:** No prebuilt SSO block exists — build a `SsoButtonGroup` wrapping `Button` with brand SVGs (Google/MS/Apple) above the email field.

### A2 — Workspace shell (`/(layout)`)
**Block:** `dashboard-01` skeleton + `sidebar-07` (collapsible 224px → icon).
**Primitives:** `sidebar` · `sidebar-trigger` · `breadcrumb` · `separator` · `command` (⌘K palette in TopBar) · `dropdown-menu` (avatar + bell) · `badge` (env+region chips) · `tooltip` (icon hints).
**Notes:** This is the chrome inherited by every authed route. Build it first as `apps/web/src/routes/(app).tsx` layout. The 4 LeftRail sections (Configure / Operate / Distribute / Workspace) become `SidebarGroup`s.

### A3 — Onboarding wizard (`/onboarding`)
**Primitives:** `progress` (5-step dots) · `card` (3 vertical-preset cards) · `radio-group` · `button` · `field` · `kbd`.
**Notes:** No first-class wizard block; compose from `card` + custom `Stepper` using `progress` + `separator`. Same skeleton reused by G2, M5, M7.

### A4 — Template gallery (`/templates`)
**Primitives:** `tabs` (segmented control: HS/Appt/Edu) · `card` (3-col grid) · `badge` · `button`.

### A5 — Empty home (`/home` empty)
**Primitives:** `empty` (already installed — perfect fit for centered-state screens) · `button` · `card`.

### B1 — Today dashboard (`/home` populated)
**Block:** `dashboard-01` (matches almost 1:1: KPI tile row + chart + table).
**Primitives:** `card` (5-up KPI tiles) · `chart` (`ChartAreaInteractive` for line chart) · `badge` (compliance posture pill stack) · `table` (recent conversations) · `tooltip`.
**Notes:** $ values use Receipt Gold per design system; live indicators use Live Cyan. Wire as Tailwind tokens in chart config.

### M1 — Welcome modal (global)
**Primitives:** `dialog` · `button` · `checkbox` (3-step checklist) · `progress` · `separator`.

### M2 — Compliance status modal (B1 chip click)
**Primitives:** `dialog` · `card` (4-tile stack) · `badge` (status pill per regulation) · `checkbox` (per-requirement) · `tooltip`.

---

## Sprint 2 · CONFIGURE

### C1 — Agents list (`/agents`)
**Block:** `dashboard-01` data-table portion (`DataTable` with sort/filter/pagination).
**Primitives:** `table` · `input` (search) · `badge` (LLM provider chip) · `button-group` (voice-preview chip) · `dropdown-menu` (row actions) · `pagination`.

### C2 — Agent editor — Behavior (`/agents/[id]?tab=behavior`)
**Primitives:** `tabs` (8-tab top: Behavior/LLM/Voice/KB/Tools/Personalization/Compliance/Analysis — shared across C2/C3/C4/C8) · `textarea` (markdown editor) · `input` (first-message) · `progress` (token meter) · `tooltip` (cost) · `card` (sticky save bar at bottom).

### C3 — Agent editor — LLM (`?tab=llm`)
**Primitives:** `tabs` (shared with C2) · `alert` (HIPAA-pruned banner) · `accordion` (3 providers) · `badge` (capability chips) · `slider` (temperature) · `radio-group` (model picker).

### C4 — Agent editor — Voice (`?tab=voice`)
**Primitives:** `tabs` (shared) · `scroll-area` (voice library strip) · `card` (voice card) · `table` (language matrix) · `alert` (multilingual swap warning) · `slider` ×4 (tuning) · `sheet` *or* fixed-position `card` (sticky preview pane).

### C8 ★ — Agent editor — Compliance (`?tab=compliance`)
**Primitives:** `tabs` (shared) · `toggle-group` (None/HIPAA/FERPA/TCPA — hero) · `card` (6-row requirement checklist) · `checkbox` · `slider` (retention) · `badge` (redaction chips) · `card` (disclosure script preview).
**Notes:** C8 toggle is workspace source-of-truth — must filter C3 model list when state changes.

### C10 ★ — Agent test drawer (global, 560px right)
**Block:** `sidebar-14` (right-side panel skeleton).
**Primitives:** `sheet` (right side, 560px) · `tabs` (Type/Talk segmented) · `scroll-area` (transcript) · `card` (chat-style turn) · `badge` (eval-verdict chips) · `collapsible` (expandable tool-call blocks) · `textarea` (composer).

### M3 — Add document modal
**Primitives:** `dialog` · `tabs` (File/URL/Text segmented) · `input` · `textarea` · `field` · `select` (folder picker) · `switch` ×2 (auto-sync, RAG) · custom `Dropzone` (use `card` + drag handlers).

### M4 — Voice A/B comparator
**Primitives:** `dialog` · `card` ×2 (voice cards, 2-col grid) · `input` (test phrase) · `slider` (waveform progress) · `radio-group` (mutually-exclusive selection) · `button` (play).

### M5 ★ — Native connector wizard (per-vertical)
**Primitives:** `dialog` · `progress` (4-step) · `breadcrumb` (steps) · `input` · `select` (field map) · `checkbox` (enable tools) · `card` (vertical-skinned: ServiceTitan/Acuity/Slate logos).
**Notes:** Same wizard scaffold as A3 / G2 / M7 — extract a `WizardShell` primitive.

### M6 — Disclosure script editor
**Primitives:** `dialog` · `select` (template dropdown, 5 templates) · `textarea` (markdown) · `alert` (real-time linter) · `switch` ×2 (verbal/written, auto-inject).

---

## Sprint 3 · OPERATE

### D1 — Telephony connectors (`/telephony`)
**Primitives:** `card` (3-card connector grid) · `badge` (capability chips) · `badge` (status pill) · `tooltip` ("Coming soon" providers).

### D2 — Phone numbers list (`/phone-numbers`)
**Block:** `dashboard-01` data-table portion.
**Primitives:** `table` · `badge` (provider chip, region) · `select` (attached agent) · `switch` (recording).
**Notes:** Number column uses JetBrains Mono — set Tailwind `font-mono` and `tabular-nums`.

### F1 — Conversations list (`/conversations`)
**Block:** `sidebar-15` (left + right) skeleton: 240px sticky filter rail + main table.
**Primitives:** `sidebar` (240px filter rail with 12 sections) · `accordion` (filter sections) · `checkbox` · `badge` (active filter chips) · `table` · `pagination`.
**Notes:** URL-persisted filter state — hook into TanStack Router `useSearch`.

### F2 ★ — Conversation detail (`/conversations/[id]`)
**Block:** `sidebar-14` (right rail) for context pane.
**Primitives:** `resizable` (3-pane 6:3:3 layout) · `scroll-area` ×3 · `tabs` (Transcript / Analysis / Context) · `card` (transcript turn) · `badge` (eval verdicts, topics) · `collapsible` (tool events) · `chart` (waveform — custom).
**Notes:** Hardest interaction — shared playhead state between waveform + transcript turns. Use a Zustand store or context, not URL params.

### F3 — Live supervisor (DARK) (`/conversations/[id]/live`)
**Primitives:** `resizable` · `scroll-area` · `card` · `button-group` (6-button intervention toolbar) · `textarea` (human-takeover composer) · `table` (audit log) · `alert-dialog` (panic button confirm).
**Notes:** **Mission Black palette only here.** The exported HTML came back with `class="light"` — gate the layout with `mode="mission-control"` and force a dark token override at component scope.

### G1 — Outbound batches list (`/batches`)
**Block:** `dashboard-01` data-table.
**Primitives:** `table` · `chart` (`ChartRadial` 24px circular status-pie per row — reuse `chart-radial-01` recipe) · `badge` (vertical-flow filter chip) · `dropdown-menu` (row actions).

### G2 — Batch create wizard (`/batches/new`)
**Primitives:** `progress` (5-step) · same `WizardShell` from A3 · `input` (CSV upload) · `select` (agent + number) · `slider` (concurrency) · `alert` (TCPA window check) · `card` (cost estimate — Receipt Gold $).

### M7 — Number import wizard
**Primitives:** `dialog` · `progress` (3-step) · `radio-group` (transport: Twilio/BYO/SIP) · `card` (transport card) · `checkbox` (discovered numbers list) · `table`.

### M10 — Convert-to-test (F2 + C10)
**Primitives:** `dialog` · `scroll-area` (chat history preview) · `collapsible` (tool calls) · `input` (success_condition) · `select` (folder picker).

### M12 — Outbound flow library (G2 step 1)
**Primitives:** `dialog` · `tabs` (vertical segmented control) · `card` (4-card flow grid) · `badge`.

---

## Sprint 4 · CLOSE

### I1 — Workspace settings (`/workspace/settings`)
**Block:** `sidebar-08` (inset secondary nav: General/Security/Webhooks/Retention/Billing/MCP).
**Primitives:** `sidebar` · `card` (6 setting cards) · `switch` · `slider` · `input` · `select` · `card` (sticky save bar) · `separator`.

### I4 — Compliance posture (`/workspace/compliance`)
**Primitives:** `card` (4-up KPI tiles) · `card` (4-up regulation card grid) · `checkbox` (5-row requirement checklists per regulation) · `table` (audit-trail) · `badge` (status pills) · `chart` (`chart-pie-01` per regulation).

### H1 — Widget customizer (`/widget`)
**Block:** None — custom split-pane.
**Primitives:** `resizable` (60/40 split) · `card` (live preview canvas) · `tabs` (9 sections: Modality/Avatar/Theme/Strings/Vars/Overrides/Feedback/Terms/Variant) · `input` · `select` · `switch` · `input-group`.

### L5 ★ — Monthly ROI receipt PDF (`/revenue/receipt/[month]`)
**Block:** None — custom A4-portrait artboard (794×1123).
**Primitives:** `card` (hero stat block, $47,200 + 121× ROI) · `table` (how-we-got-there + per-agent breakdown) · `progress` (per-agent bars) · `badge` (comparison delta) · `separator`.
**Notes:** Renders as a printable artboard — set `@media print` styles. All $ values use Receipt Gold.

### Pending refire (no HTML yet)
- **H2** Embed snippet + landing — `tabs` (CMS picker) + `card` (snippet) + syntax-highlighted code block.
- **L1** Speed-to-Lead trigger console — `table` + `dialog` (M19 setup).
- **L4 ★** Revenue Attribution dashboard — `dashboard-01` skeleton + custom multi-dimension breakdown.
- **L7** Passive Intelligence digest — feed of `card` items + `badge` topic chips.
- **M19** Speed-to-Lead trigger setup — `dialog` + `WizardShell`.
- **M21** Attribution outcome webhook — `dialog` + `input` + `code`.

---

## Cross-screen primitives to extract first

These appear in 5+ screens — build them once in `packages/ui` before slotting screens in:

| Primitive | Used in |
|---|---|
| `WizardShell` (progress + steps + actions) | A3, G2, M5, M7, M19 |
| `KpiTile` (composes `card`+ `chart` + currency) | B1, I4, L4, L5 |
| `StatusPill` (composes `badge` + dot color) | B1, C1, D2, F1, G1, I1 |
| `ScopeChip` (env + region; composes `badge`) | A2 (TopBar) — used everywhere |
| `WaveformPlayer` (custom; SVG + shared playhead) | F2, F3 |
| `AgentEditorTabs` (8-tab `tabs` shared by C2/C3/C4/C8 + 4 unfired) | C2, C3, C4, C8 |
