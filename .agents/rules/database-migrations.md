---
description: Prisma migrations — autogenerate only, never hand-edit SQL
globs: "prisma/**/*"
---

# Database migrations (Prisma)

All schema changes go through **Prisma Migrate**. SQLite connection uses `DATABASE_URL` (`file:…`).

## Rules

- **Do not** create, edit, or reorder files under `prisma/migrations/` by hand (no manual SQL, no `prisma migrate diff` into the tree).
- **Do not** use `prisma db push` for shared environments or committed schema—use migrations.
- Change **`prisma/schema.prisma`**, then create a revision with:

  ```bash
  pnpm db:make -- descriptive_snake_name
  ```

- Apply pending migrations in CI/production:

  ```bash
  pnpm db:migrate
  ```

- Regenerate client after schema changes: `pnpm db:generate` (also runs on `postinstall`).

## Naming

Use short, snake_case migration names (`add_audit_indexes`, `user_invites`). One logical schema change per migration when practical.
