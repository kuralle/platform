# Spec + Code-Quality Gate — `S0-04` OpenAPI emission + drift CI

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.  
> Verdict: **green**.

---

## 1. Spec adherence

| AC | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `apps/server/openapi.json` committed and matches live server emission | **met** | File exists (`apps/server/openapi.json:1`). Contains `/healthCheck` and `/privateData` paths. Generated programmatically via `OpenAPIGenerator` from `@orpc/openapi@1.14.0`. |
| 2 | `bun -F server gen:openapi` idempotent | **met** | Ran twice; `git diff --exit-code apps/server/openapi.json` exited `0` both times. |
| 3 | `bun -F server gen:openapi --check` exits non-zero on drift | **met** | Temporarily added `helloWorld` to router, ran `--check`, exited `1` with ❌ message. Reverted router, `--check` exited `0`. |
| 4 | `.github/workflows/openapi-drift.yml` exists and structurally correct | **met** | Triggers on `push: [main]` and `pull_request`. Steps: checkout → setup-bun@v2 (1.3.9) → `bun install --frozen-lockfile` → `bun -F server gen:openapi --check`. |
| 5 | Artifact captures clean + deliberate-drift runs | **met** | `sprints/sprint-0/artifacts/S0-04-drift-ci.txt` present. Shows clean pass, drift demonstration, and restoration. |
| 6 | README documents rule and spec URL | **met** | `apps/server/README.md:24-41` — "OpenAPI contract" section. Documents `/api-reference/spec.json`, regeneration command, PR rule, CI gate, and `--check` pre-commit usage. |
| 7 | Spec contains `healthCheck` and `privateData` | **met** | `jq '.paths | keys' apps/server/openapi.json` → `["/healthCheck","/privateData"]` (verified live and in artifact). |
| 8 | `bun run check-types` green workspace-wide | **met** | `4 successful, 4 total` — all cached/hit, no errors. |
| 9 | No workarounds, no `@ts-ignore`, no silent catch | **met** with finding | No `@ts-ignore` or `--no-verify`. One empty `catch` in cleanup (see §2). |

---

## 2. Code quality

- **`apps/server/scripts/gen-openapi.ts`** — clean, surgical implementation. Uses `OpenAPIGenerator` (programmatic API, preferred) with `ZodToJsonSchemaConverter`. Deterministic `sortKeys` for stable output. Single file handles both write and `--check` modes.
  - **Finding:** Line 55 has an empty `catch { /* cleanup is best-effort */ }` inside a `finally` block. This is a silent catch — low risk (temp-file unlink), but violates the "no silent catch" rule. Fix: either log the error or drop the inner try/catch (process is exiting anyway).
- **`apps/server/openapi.json`** — deterministic, key-sorted, trailing newline. No hand-edits.
- **`.github/workflows/openapi-drift.yml`** — correct. Uses `oven-sh/setup-bun@v2` with pinned `1.3.9`. `--frozen-lockfile` is good hygiene.
- **`apps/server/README.md`** — well-scoped addition. Cites source version and explains why no DB/server boot is needed.
- **`apps/server/package.json`** — `gen:openapi` script correctly wired. No new dependencies added.
- **`bun.lock`** — zero diff against parent commit. Clean.
- **`packages/api/src/routers/index.ts`** — zero diff. No router changes committed, as required.

---

## 3. Apply-now items for manager

1. **Remove silent catch in `gen-openapi.ts:55`** — change:
   ```ts
   } finally {
     try {
       unlinkSync(tmpPath);
     } catch {
       /* cleanup is best-effort */
     }
   }
   ```
   to either unconditional `unlinkSync(tmpPath)` (let it throw on the rare failure) or `catch (e) { console.warn('failed to clean up temp file:', e) }`.

---

## 4. Carry-forwards

1. **Schema usefulness** — The generated spec contains `anyOf: [{}, { not: {} }]` for both response bodies because the existing `healthCheck` and `privateData` procedures lack `.output()` Zod schemas. The spec is technically correct but minimally informative. Future router work should add output schemas to make the contract useful.
2. **Artifact rigor** — The drift-ci artifact is narrative rather than a literal shell transcript (e.g., `$ cat packages/api/src/routers/index.ts` shows a comment placeholder instead of actual content). Acceptable for sprint-0, but future artifacts should prefer copy-pasted terminal output.
3. **Windows portability** — The `--check` mode shells out to the system `diff` binary. This is fine for CI (`ubuntu-latest`) and the team's macOS dev environment, but a pure-JS buffer comparison would be more portable if the team grows.

---

## 5. Honest summary

The IC delivered exactly what the brief asked for: a programmatic OpenAPI generator, committed canonical spec, idempotent write mode, `--check` drift gate, CI workflow, README documentation, and a manual drift demonstration artifact. `check-types` is green. No new dependencies. No router mutations persisted. The only deviation from perfect is a single empty catch block used for temp-file cleanup — trivial to fix in r1.

---

## 6. Recommended action

- **Ready for r1.** Merge after applying the one-line catch fix from §3.
