# Kuralle · SaaS Model

How Kuralle is licensed, deployed, priced, and monetized.

Companion to `DATA_MODEL.md` (schema) and `CONVERSATION_BLUEPRINT.md` (runtime). This doc is the business contract: who pays whom, for what, under which license.

---

## 1 · One-line positioning

> **Kuralle is the open-source backend that lets agencies and operators resell voice AI under their own brand — with the runtime, dashboard, compliance, and billing in one repo.**

Two audiences, one codebase:

| Audience | What they want | What they pay for |
|----------|----------------|-------------------|
| **Operators** (a clinic, an HVAC shop, a school) | One agent, one number, one dashboard | Per-minute usage, flat seat |
| **Agencies** (the "chat-dash" customer) | A white-label platform to resell voice AI to *their* clients | Platform fee + sub-accounts + Stripe Connect |

The schema already supports both: an agency is a parent workspace with child workspaces (their clients). No second product to build.

---

## 2 · The four deploy tiers

One codebase. Four ways it runs. Each tier is additive — you can move up without a rewrite.

```
                                                  Managed
                                                  ──────
                                                  region-routed
                                                  HIPAA-mode
   Kubernetes                                     SSO + audit
   ──────────                                     SLA
   horizontal scale
   Hyperdrive / multi-region    │
   pgvector                     │
   ───────────────────────►     │
                                │
   docker-compose         ─────►│
   ───────────────              │
   one VM, all-in-one           │
   Postgres + R2-compat         │
   no Cloudflare Workers        │
   LISTEN/NOTIFY for live       │
   ───────────────────►         │
                                │
   Single-host  ─────►          │
   ───────────                  │
   bun + sqlite-friendly        │
   no telephony, widget only    │
   for solo devs / OSS try     │
                                ▼
   $0                                              $$$$
```

| Tier | Who runs it | What's included | License | Price |
|------|-------------|-----------------|---------|-------|
| **Single-host** | OSS hobbyist, solo dev | Web UI, widget runtime, in-process AriaFlow, file-backed sinks, no telephony | FSL → Apache 2.0 (2y) | Free |
| **docker-compose** | Indie agency, self-hoster | Postgres + R2-compat (MinIO) + LISTEN/NOTIFY + telephony adapter; no DOs | FSL → Apache 2.0 (2y) | Free |
| **Kubernetes** | Mid-size agency, in-house ops | Helm chart, Hyperdrive-equivalent pooling, pgvector, pg-boss workers, multi-region option | FSL → Apache 2.0 (2y) | Free |
| **Managed Cloud** | Anyone who'd rather not | Multi-region DOs, HIPAA-mode, SSO, audit retention, BAA, support SLA | Commercial (us hosting) | See §5 |

The license cliff matters: **FSL** (Functional Source License) means you can self-host, fork, modify, embed in your own product — but you can't resell Kuralle-as-Kuralle as a competing managed service. After 2 years each commit converts to Apache 2.0 automatically. n8n and Sentry use this pattern; it's the cleanest way to keep the "agency reselling voice AI to *their* clients" use case fully blessed while preventing AWS-style platform clones.

---

## 3 · What's in each tier (the line that separates them)

The split isn't about features — every tier runs the same web UI, the same AriaFlow runtime, the same schema. The split is about **operational primitives**.

| Capability | Single | Compose | k8s | Managed |
|------------|--------|---------|-----|---------|
| Web dashboard, agent editor, KB, workflows | ✓ | ✓ | ✓ | ✓ |
| Embedded widget runtime | ✓ | ✓ | ✓ | ✓ |
| Postgres + Drizzle migrations | sqlite-fallback | ✓ | ✓ | ✓ |
| Telephony (Twilio / SIP) | ✗ | ✓ | ✓ | ✓ |
| Live supervisor (F3) | local-only | LISTEN/NOTIFY | LISTEN/NOTIFY or DO | Cloudflare DO |
| pg-boss async jobs (summary, eval, extract) | sync inline | ✓ | ✓ | ✓ |
| pgvector RAG | ✗ | ✓ | ✓ | ✓ |
| Recordings → object storage | local disk | MinIO | S3 | R2 + Glacier |
| Multi-region routing | ✗ | ✗ | optional | ✓ |
| SSO / SCIM | ✗ | ✗ | optional add-on | ✓ |
| HIPAA-mode (zero-retention LLM, BAA) | ✗ | ✗ | self-attest | ✓ + BAA |
| Audit retention 6yr (Glacier) | ✗ | ✗ | self-managed | ✓ |
| Stripe Connect for agencies | ✗ | optional | ✓ | ✓ |
| Support SLA | community | community | community | 99.9% + on-call |

The k8s tier is intentionally feature-complete for agencies who want zero managed-service dependency. The managed tier monetizes only the things agencies genuinely won't run themselves: multi-region DOs, BAA, audit archive, on-call.

---

## 4 · License choice — FSL with Apache fallback

Three viable licenses for this category:

| License | Pros | Cons | Examples |
|---------|------|------|----------|
| **MIT / Apache 2.0** | Maximum adoption, zero friction | AWS/competitor can clone managed tier 1:1 | Vapi (Apache) |
| **AGPLv3** | Strong copyleft, blocks SaaS clones | Enterprises won't touch it; agencies can't embed | n8n (until 2022) |
| **FSL** (Functional Source) | Blocks competing managed services for 2y; otherwise permissive | Newer, less recognised | Sentry, n8n, Bruno |
| **n8n SUL** (Sustainable Use) | Clear "internal use only" carveout | Custom license, lawyer-heavy | n8n |

**Pick FSL.** Specifically:

- **Functional Source License 1.1, Apache-2.0 Future License**.
- Two-year change date — every commit auto-converts to Apache 2.0 24 months after merge.
- Permitted use: anything except a *Competing Use* (a managed offering that competes with Kuralle Cloud).
- Agencies reselling voice AI to *their* clients are explicitly **not** a competing use — that's our customer.

This is the same posture Sentry took. It threads the needle: solo devs / agencies / enterprises all run it freely, AWS doesn't get to fork a competing managed Kuralle.

---

## 5 · Managed Cloud pricing

Two pricing axes, parallel to the two audiences.

### 5.1 · Operator pricing (single workspace, end customer)

Per-minute, no platform fee.

| Plan | Included minutes | Overage | Notes |
|------|------------------|---------|-------|
| **Free** | 60 min/mo | — | one agent, one number, Kuralle branding |
| **Starter** | 1,000 min/mo @ $29/mo | $0.04/min | three agents, BYO Twilio |
| **Growth** | 5,000 min/mo @ $99/mo | $0.03/min | unlimited agents, webhooks, evals |
| **Scale** | 25,000 min/mo @ $399/mo | $0.025/min | SSO, audit log, priority support |
| **Enterprise** | Custom | Custom | HIPAA-BAA, dedicated region, on-call |

LLM + STT/TTS pass through at provider cost (via BYOK or our resold rate, marked up ~10%). The minute price covers runtime, dashboard, recording storage.

### 5.2 · Agency pricing (parent workspace + child workspaces)

This is where Kuralle directly competes with chat-dash, Stammer, Vapify. Hybrid model — flat platform fee, *no markup on minutes*, agency keeps 100% of what they bill clients.

| Plan | Included client workspaces | Extra clients | Platform features |
|------|----------------------------|---------------|-------------------|
| **Agency Starter** | 5 @ $99/mo | $15/client/mo | White-label, Stripe Connect, sub-accounts |
| **Agency Growth** | 20 @ $299/mo | $10/client/mo | Custom domain, agency-branded emails |
| **Agency Scale** | 100 @ $899/mo | $5/client/mo | API access, SSO, dedicated success manager |
| **Agency Enterprise** | Unlimited | — | HIPAA-BAA, multi-region, audit retention |

**Key differentiator vs ChatDash ($1,200–$6,000/yr annual-only with $10–15/slot):**

- Monthly billing — agencies hate annual prepay.
- Slot caps are a soft cap with overage, not a hard wall.
- *No markup on voice minutes* — agency's Twilio/OpenAI bill is theirs alone.
- HIPAA-mode at $200/mo flat, included free in Enterprise.

The arbitrage agencies care about (charging clients $300–$2,000/mo per voice agent vs $30 in underlying cost) stays 100% in the agency's pocket. Kuralle monetizes the platform, not the markup.

### 5.3 · Add-ons (both audiences)

| Add-on | Price | What it unlocks |
|--------|-------|-----------------|
| **HIPAA-mode** | $200/mo | BAA, zero-retention LLM, encrypted recordings, 6yr audit |
| **SSO / SAML** | $99/mo | Okta, Azure AD, Google Workspace |
| **Audit log retention** | $49/mo | Glacier archive, compliance export |
| **Dedicated region** | $499/mo | EU, APAC, or single-tenant US shard |
| **On-call SLA** | $999/mo | 24/7 phone, 30-min response, 99.95% uptime |

---

## 6 · Why this beats the competitors' models

| Competitor | Their flaw | Kuralle's answer |
|------------|------------|------------------|
| **ChatDash** ($1,200–6,000/yr) | Annual-only, slot-capped, HIPAA only at top tier | Monthly, soft-capped, HIPAA add-on at every tier |
| **VoiceAIWrapper** ($29–499/mo) | No open-source escape hatch — vendor lock | FSL self-host means an agency can leave anytime |
| **Stammer.ai** ($197–497/mo) | Closed-source, no extensibility, no AriaFlow primitives | Open-core, full Drizzle schema, custom flows |
| **Vapify** ($29–399/mo) | Thin wrapper over Vapi, no compliance story | Native HIPAA-mode, audit log, BAA |

The three things none of them give an agency:
1. **Source code.** When the platform changes pricing or sunsets a feature, you fork.
2. **Compliance posture written into the data model.** Not a checkbox — schema-level retention enforcement.
3. **AriaFlow primitives surfaced in the UI.** Workflows, extraction nodes, evals, sinks — not just system prompts.

---

## 7 · Revenue model assumptions (year 1)

Worked backwards from what's plausible, not aspirational.

```
Operator side
─────────────
  100 paid Starter @ $29     =  $2,900 MRR
   30 paid Growth  @ $99     =  $2,970 MRR
    5 paid Scale   @ $399    =  $1,995 MRR
                              ─────────────
                                $7,865 MRR  (operators)

Agency side
───────────
   20 paid Starter @ $99 + ~3 extra slots avg    =  $2,880 MRR
   10 paid Growth  @ $299 + ~5 extra slots avg   =  $3,490 MRR
    3 paid Scale   @ $899                         =  $2,697 MRR
                                                  ─────────────
                                                    $9,067 MRR  (agencies)

Add-ons (HIPAA / SSO / region) ~ 30% attach        $3,000 MRR
                                                  ─────────────
                                                  ~$20K MRR ($240K ARR)
```

Agency revenue is structurally bigger per logo, but operator volume is the funnel — every operator who outgrows their needs is a future agency, every agency lands 5–100 operator workspaces under it. This is why the same codebase serves both.

---

## 8 · What we don't do (deliberately)

- **No markup on voice minutes for agencies.** Stammer's "$487 profit per agent" line is the entire reason agencies pick this category. Skim that and you compete with your own customer.
- **No "request a demo" gate.** Self-serve from sign-up to first call. Agencies hate friction more than they hate price.
- **No proprietary runtime fork.** Managed Cloud runs the *same* AriaFlow that's in the OSS repo. If a self-hoster's call works, ours works. No "managed-only optimizations" to lock people in.
- **No annual-only billing on entry tiers.** Annual prepay at the Enterprise tier only.
- **No hidden compliance gating.** HIPAA-mode is a $200/mo add-on at *every* tier including Free + self-host (BAA is the only piece we charge for; the technical primitives ship in OSS).

---

## 9 · Open questions

1. **Stripe Connect rails — Standard, Express, or Custom?** Express is the right default for agency UX (clients onboard in agency's domain), but Standard is simpler. Decision pending first agency design partner.
2. **BYOK vs resold inference — what's the default for OpenAI / Anthropic / Cartesia?** Resold is better margin (~10%) and simpler UX; BYOK is better trust and required for HIPAA-mode.
3. **Open-source telephony adapter — Twilio first, or build SIP-direct from day one?** Twilio is faster to market; SIP-direct is what enterprise agencies need within 6 months.
4. **Free tier minute count.** 60 min/mo is conservative. Vapi gives 1,000. Anything under 100 feels stingy; anything over 500 is real cost.
5. **Open-core boundary for SSO and audit.** SSO in OSS or paid-only? n8n flipped this in 2024 (moved SSO into paid). Decision: keep SAML in OSS, charge for SCIM provisioning and audit retention.

---

## 10 · Roadmap to first dollar

1. **Weeks 0–4** — managed sign-up + Stripe + operator Starter/Growth/Scale tiers. Free tier disabled until limits + abuse controls land.
2. **Weeks 4–8** — agency parent-workspace UI, child workspace creation, Stripe Connect Standard.
3. **Weeks 8–12** — HIPAA-mode add-on (BAA template, zero-retention provider routing, audit retention).
4. **Weeks 12–16** — Helm chart + docs for k8s self-host, FSL license bake.
5. **Weeks 16+** — SSO, multi-region, dedicated regions, enterprise SLA.

Operator revenue should fund itself by week 8. Agency revenue compounds from week 12.
