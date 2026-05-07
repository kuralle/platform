# Gate Brief — `S0-04` OpenAPI emission + drift CI

> **You are pi/kimi-k2.6, the spec + code-quality gate.** IC was `pi`/`deepseek-v4-pro`, committed at `2e86acd`. Your output is a markdown report only. No code changes, no commits.

---

## 1. Context

- **Story:** `S0-04` — OpenAPI emission + drift CI gate.
- **IC commit:** `2e86acd` — `[S0-04] OpenAPI emission + drift CI gate`.
- **Brief:** `sprints/sprint-0/brief-S0-04.md`.
- **IC transcript:** `.handoff/result-S0-04.txt` (short summary; pi flushed only on completion).
- **Diff:** `git show 2e86acd` (read every modified file).

Files in the diff:
- create `apps/server/scripts/gen-openapi.ts`
- create `apps/server/openapi.json`
- create `.github/workflows/openapi-drift.yml`
- create `sprints/sprint-0/artifacts/S0-04-drift-ci.txt`
- modify `apps/server/package.json`
- modify `apps/server/README.md`

## 2. Spec gates to verify

Walk every AC in `brief-S0-04.md §4` (criteria 1–9):

1. `apps/server/openapi.json` matches what the live server emits. Read the file. Confirm at minimum the two existing procedures (`healthCheck`, `privateData`) appear in the spec.
2. `bun -F server gen:openapi` is **idempotent** — running it twice produces no diff.
3. `bun -F server gen:openapi --check` exits non-zero on drift. The artifact `S0-04-drift-ci.txt` should capture both a clean run and a deliberate-drift run.
4. `.github/workflows/openapi-drift.yml` exists, structurally inspectable.
5. The `--check` flag is documented in README.
6. `bun run check-types` green.
7. **Programmatic API used** (preferred) vs live HTTP fetch fallback. Pi reports it used `OpenAPIGenerator` from `@orpc/openapi`. Verify by reading `apps/server/scripts/gen-openapi.ts` — does it actually use the programmatic API?
8. The spec URL on `OpenAPIReferencePlugin` (pi reports `/api-reference/spec.json`). Verify by reading the script.

## 3. Code-quality + project-rule checks

- No `--no-verify`, no `@ts-ignore`, no silent catch in `gen-openapi.ts`.
- The script has both write mode and `--check` mode in one file.
- The committed `openapi.json` is deterministic (sorted keys, stable shape).
- The CI workflow YAML uses correct steps: checkout → install bun → bun install → run `gen:openapi --check` → fail on drift.
- README's "OpenAPI contract" section: documents the rule that every router PR commits the regenerated spec; documents the spec URL.
- `package.json` `gen:openapi` script is correctly wired.
- `bun.lock` only changes if a new dep was added — verify minimal.

## 4. Output

Write `sprints/sprint-0/gate-S0-04.md` with these sections:

```md
# Spec + Code-Quality Gate — `S0-04` OpenAPI emission + drift CI

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.
> Verdict: green | yellow | red.

## 1. Spec adherence
(table — each AC met / partial / missed with file:line evidence)

## 2. Code quality
(bullet list per file — clean / finding / smell)

## 3. Apply-now items for manager
- ...

## 4. Carry-forwards
- ...

## 5. Honest summary

## 6. Recommended action
- Ready for r1 / Needs IC fix / Ambiguous spec
```

## 5. Tone

Calm, on-team. The manager reads your report alongside the diff. Your report makes the manager's r1 review faster, not redundant.

When in doubt about `@orpc/openapi` API shape, use context7 (`/orpc/orpc`) or read the installed source under `node_modules/.bun/.../@orpc/openapi/`.
