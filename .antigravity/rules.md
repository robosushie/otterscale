# Antigravity — Otterscale

Follow root [`AGENTS.md`](../AGENTS.md). Workspace rules: [`.agents/rules/`](../.agents/rules/) — `agents-policy.md`, `typescript-standards.md`, `solid-principles.md`, `theme.md`, `git-commits.md`.

Apply [`.agents/rules/theme.md`](../.agents/rules/theme.md) when editing UI.

**Git commits:** [`.agents/rules/git-commits.md`](../.agents/rules/git-commits.md) — only commit when the user asks; conventional types and imperative subjects.

**Migrations:** [`.agents/rules/database-migrations.md`](../.agents/rules/database-migrations.md) — `pnpm db:make` only; never hand-edit `prisma/migrations/`.

**Full theme:** [`docs/theme.md`](../docs/theme.md)

## UI mandate (summary)

- Light editorial shell on parchment `#f6f3f1`.
- Primary actions: Lake Blue `#2b59d1` (one per screen), 6px radius.
- Headlines: Newsreader weight 400; body/UI: IBM Plex Mono.
- Cards: 8px radius, Ash hairline, no drop shadows. Console uses a left sidebar, not bento grids.
- Tokens live in `app/globals.css`.

Trace significant UI work per your team’s Antigravity workflow; design decisions should match `docs/theme.md`.
