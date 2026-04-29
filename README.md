# Kuralle

> Operator-grade voice AI + unified inbox. Built for HVAC owner-operators at
> 11 PM and university Title-IX officers at 9 AM.

**Stack:** TypeScript, React 19, TanStack Router (file-based), TailwindCSS v4,
shadcn/ui (`base-lyra` style), Hono + oRPC (server, not integrated yet),
Drizzle + Turso (db, not integrated yet), Better-Auth (not integrated yet),
Cloudflare Workers via Alchemy, Turborepo + Bun.

The product name is **Kuralle**. The internal design language is the **Vokari**
operator-grade aesthetic codified in `.stitch/DESIGN.md` (parent repo).

---

## Quick start

```bash
bun install
bun -F web dev:bare        # vite dev server at http://localhost:3001
bun -F web test            # 34 tests · vitest + testing-library
bun run check-types        # type-check the workspace
```

Open <http://localhost:3001>. The router redirects `/` → `/home`. No auth gate —
sign-in is purely visual.

---

## What's built

A complete UI front-end with no real integrations. Every screen is interactive
and backed by deterministic mocks.

### Sprints implemented (Stitch IDs in parens)

- **LAND** — `/auth/sign-in` (A1) · `/home` (A5 empty + B1 populated) ·
  `/onboarding` (A3) · `/templates` (A4) · welcome modal (M1) · compliance
  status modal (M2)
- **CONFIGURE** — `/agents` (C1) · agent editor with 4 tabs (C2 Behavior /
  C3 LLM / C4 Voice / C8 Compliance ★) · global test drawer (C10 ★) · add-doc
  modal (M3) · voice A/B (M4) · connector wizard (M5 ★) · disclosure script
  editor (M6)
- **OPERATE** — `/telephony` (D1) · `/phone-numbers` (D2) · `/conversations`
  (F1) · `/conversations/:id` (F2 ★) · `/conversations/:id/live` (F3 Mission
  Control) · `/batches` (G1) · `/batches/new` (G2) · number-import wizard
  (M7)
- **CLOSE** — `/workspace/settings` (I1) · `/workspace/compliance` (I4) ·
  `/widget` (H1) · `/revenue/receipt/2026-04` (L5 ★ A4 artboard)

★ = persona-blocking. See `screens/COMPONENT-MAP.md` for the full mapping.

### Foundations

- **Vokari design tokens** — full palette wired into `packages/ui/src/styles/globals.css`
  (Signal Teal, Live Cyan, Receipt Gold, Mission Black, Audit Indigo, etc.).
  Geist + Inter + JetBrains Mono fonts loaded from Google Fonts.
- **App shell (`A2`)** — TopBar (Kuralle wordmark + env / region scope chips +
  ⌘K command palette + bell + avatar dropdown) + collapsible LeftRail with
  4 sections (Configure / Operate / Distribute / Workspace) + 12 nav links.
- **Mock data layer** — typed factories for agents, conversations, batches,
  numbers, KPIs, ROI receipts. Deterministic by seed.
- **Workspace context** — vertical preset (HS / Appt / Edu) + environment +
  region. Persisted to `localStorage`.
- **Cross-screen primitives** in `@kuralle/ui` — `LiveDot`, `StatusPill`,
  `ScopeChip`, `ComplianceChip`, `Sparkline`, `KpiTile`, `VoicePreviewChip`,
  `WaveformPlayer`, `WizardShell`, `Eyebrow`, `StickySaveBar`, `PageHeader`.
- **34 tests** covering primitives, mocks, format helpers, and the workspace
  context.

---

## Layout

```
kuralle/
├── apps/
│   ├── web/                 React + TanStack Router app (this is what we ship)
│   │   ├── src/
│   │   │   ├── routes/      file-based routes (matches Stitch IDs)
│   │   │   ├── components/  shell/, configure/, modals/, theme-provider
│   │   │   ├── contexts/    workspace.tsx
│   │   │   ├── mocks/       deterministic factories
│   │   │   ├── lib/         format helpers
│   │   │   ├── types/       domain.ts
│   │   │   └── test/        vitest
│   │   └── vitest.config.ts
│   └── server/              Hono / oRPC server (NOT integrated)
├── packages/
│   ├── ui/                  @kuralle/ui — shadcn primitives + Vokari primitives
│   ├── api/  auth/  db/     workspace packages (NOT integrated)
│   └── env/  config/        shared env + tsconfigs
└── screens/                 raw Stitch HTML exports + COMPONENT-MAP.md
```

See `ARCHITECTURE.md` for a deeper walk-through of routing, state, tokens,
and the verification loop.

---

## Project commands

| Command | Effect |
|---|---|
| `bun install` | install workspace deps |
| `bun run dev` | turbo-fan-out dev for every app that has a `dev` script |
| `bun -F web dev:bare` | vite dev server only, no turbo |
| `bun -F web build` | production build |
| `bun -F web check-types` | tsc + vite build check |
| `bun -F web test` | run vitest |
| `bun -F web test:watch` | vitest in watch mode |
| `bun run check-types` | check types across the workspace |

---

## UI customization

shadcn/ui primitives are shared via `@kuralle/ui`. Add more from the registry:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import in apps:

```tsx
import { Button } from "@kuralle/ui/components/button";
import { KpiTile } from "@kuralle/ui/components/kpi-tile";
```

App-specific blocks live under `apps/web/src/components/` — `shell/`,
`configure/`, `modals/`. Don't put workspace-specific business logic in
`packages/ui` — it's strictly primitives.

---

## Database setup (deferred)

The server / DB / auth packages exist in the workspace but the web app is
intentionally not wired to any of them yet. When integrations land:

```bash
bun run db:push           # push Drizzle schema
bun run db:generate       # generate client + types
bun run dev:server        # start the Hono server
```

The web `dev` will then proxy oRPC calls to it.

---

## Deployment

Cloudflare Workers via Alchemy.

- `bun run deploy` — deploy
- `bun run destroy` — tear down

Full guide: <https://www.better-t-stack.dev/docs/guides/cloudflare-alchemy>.

---

## See also

- `ARCHITECTURE.md` — routing, state, tokens, primitives, verification loop
- `screens/COMPONENT-MAP.md` — Stitch screen → shadcn component map
- `.stitch/DESIGN.md` (parent repo) — the Vokari design system
- `.stitch/DEV-HANDOFF.md` (parent repo) — the original engineering handoff
