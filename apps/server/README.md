# Local server (`apps/server`)

## Local development — Postgres

One-time setup uses system Postgres (for example Postgres.app on `localhost:5432`). Docker Compose is intentionally not used this sprint—the same `DATABASE_URL` shape works against Neon in production with a different host, port, and credentials.

```bash
# One-time: create the development database and a role.
psql postgres <<'SQL'
CREATE ROLE kuralle WITH LOGIN PASSWORD 'kuralle';
CREATE DATABASE kuralle_dev OWNER kuralle;
GRANT ALL PRIVILEGES ON DATABASE kuralle_dev TO kuralle;
SQL

# In apps/server/.env (add this line; keep the existing ones):
# DATABASE_URL=postgres://kuralle:kuralle@localhost:5432/kuralle_dev

# Generate + push the schema:
bun -F @kuralle/db db:generate
bun -F @kuralle/db db:push
```

Copy `apps/server/.env.example` to `apps/server/.env` and fill in secrets before running the worker locally.

## OpenAPI contract

The canonical OpenAPI 3.1 spec lives at `apps/server/openapi.json`. It is a **build artifact** —
never edit it by hand. Regenerate with:

```bash
bun -F server gen:openapi
```

- The live spec is served by the `OpenAPIReferencePlugin` at `/api-reference/spec.json` (default `specPath`).
  The Scalar UI is at `/api-reference` (default `docsPath`). Source: `@orpc/openapi` v1.14.0 plugin config.
- **Every PR that adds or changes a router MUST regenerate the spec** and commit the result.
- CI fails on drift via `.github/workflows/openapi-drift.yml`.
- For fast pre-commit feedback, run `bun -F server gen:openapi --check`.

Spec generation uses `OpenAPIGenerator` (programmatic API from `@orpc/openapi`), not a live HTTP
fetch, so no server boot or DB connection is required. Output is deterministically key-sorted.
