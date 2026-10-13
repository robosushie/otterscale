---
description: Goose migrations in packages/core — sqlite and postgres
globs: "packages/core/migrations/**/*"
---

# Database migrations

Schema changes are goose SQL under `packages/core/migrations/sqlite` and `packages/core/migrations/postgres`. Core applies the dialect that matches `DATABASE_URL` on startup.

## Rules

- Add the next numbered `*.sql` in **both** dialect folders. Keep the SQLite shape compatible with an existing Prisma volume (`CREATE TABLE IF NOT EXISTS` for the baseline).
- Empty `DATABASE_URL` opens `/data/otterscale.db` (`OTTERSCALE_DATA_DIR` overrides the directory). `postgres://` uses the Postgres files. `file:` and `sqlite:` open that file.
- Do not add a MySQL dialect.

## Naming

Use short snake_case names (`00002_add_audit_indexes.sql`). One logical schema change per migration when practical.
