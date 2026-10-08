<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Shared agent policy

All coding agents follow this file first. Cursor: [`.cursor/rules/agents-policy.mdc`](./.cursor/rules/agents-policy.mdc) (`alwaysApply`). Modular rules: [`.agents/rules/`](./.agents/rules/).

| Resource | Purpose |
|----------|---------|
| [`.agents/rules/agents-policy.md`](./.agents/rules/agents-policy.md) | Non-negotiables, stack, before-you-code |
| [`.agents/rules/typescript-standards.md`](./.agents/rules/typescript-standards.md) | TS strictness, Next.js App Router, types |
| [`.agents/rules/solid-principles.md`](./.agents/rules/solid-principles.md) | SOLID for console + planned Go services |
| [`docs/architecture.md`](./docs/architecture.md) | Components, layering, Headscale adapter boundary |

**Non-negotiables:** no secrets in git; no infra/CDK/deploy invention unless asked; required auth/env must **fail loud** (no silent guest auth UI); smallest correct diff; UI uses [theme](#otterscale-design-theme); commits only when the user asks.

## Otterscale design theme

UI and styling follow the light editorial theme in `docs/theme.md`.

| Resource | Purpose |
|----------|---------|
| [`docs/theme.md`](./docs/theme.md) | Canonical tokens, components, CSS |
| [`CODEX.md`](./CODEX.md) | Codex-focused theme summary |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code theme + Next.js pointers |
| [`.agents/rules/theme.md`](./.agents/rules/theme.md) | Antigravity / glob-triggered UI rules |
| [`.cursor/rules/theme.mdc`](./.cursor/rules/theme.mdc) | Cursor UI rule (same theme) |

**Quick colors:** canvas `#f2f0eb`, text `#292827`, primary CTA `#421d24`, links `#714cb6`, secondary button `#d4c7ff`, dark band `#0c4243` (full-bleed only).

## Git commits

Only commit when the user asks. Conventional commits: `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style` — imperative subject ≤72 chars, body explains why.

| Resource | Purpose |
|----------|---------|
| [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md) | Full format and examples |
| [`.cursor/rules/git-commits.mdc`](./.cursor/rules/git-commits.mdc) | Cursor always-on rule |

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
