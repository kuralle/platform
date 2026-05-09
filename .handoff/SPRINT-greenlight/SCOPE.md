# Closed-Customer-Testing Scope

**Cohort:** 5–20 paying design partners. Real businesses. Signed contracts.

**In scope (Greenlight Super-Sprint):**
- Web app: signup, onboarding, agents (CRUD, knowledge attach), conversations (list, detail), batches, receipts, workspace settings.
- Auth: better-auth + organization plugin, route guards, multi-tenant isolation.
- Billing/receipts: real usage from `usage.getMonthlyUsageReport`.

**Deferred (NOT in scope for cohort #1):**
- Auto-provisioned Twilio numbers from the in-app wizard. Numbers are provisioned by the Kuralle team via email handoff. The customer-facing UI says so honestly.
- Cloudflare Queue → projector path (CF adapter is a stub; Node BullMQ adapter works for local dev). Meta-channel projection in production is offline until Sprint 4.
- Voice agent outbound calling (the platform's headline feature) — only inbound WhatsApp / pre-existing-number routing.
- Workflow editor (hidden behind EmptyState until Sprint 4 per GL-06).

**Customer-side ops contract:**
- Onboarding email channel: `onboarding@kuralle.app` (or the real address).
- Number provisioning SLA: same business day.
- Live-call walkthrough: scheduled with the design partner before they hand the number to a real customer.
