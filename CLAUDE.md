# Claude Code — Otterscale

Follow repository [`AGENTS.md`](./AGENTS.md) for shared policy, Next.js (read `node_modules/next/dist/docs/`), TypeScript ([`.agents/rules/typescript-standards.md`](./.agents/rules/typescript-standards.md)), and SOLID ([`.agents/rules/solid-principles.md`](./.agents/rules/solid-principles.md)).

## Design system

All visual work must follow the light editorial theme.

- **Canonical spec:** [`docs/theme.md`](./docs/theme.md)
- **Glob rule mirror:** [`.agents/rules/theme.md`](./.agents/rules/theme.md)

### Quick enforcement

| Concern | Rule |
|---------|------|
| Page background | `#f6f3f1` parchment |
| Body / UI text | `#242424` Off-Black, IBM Plex Mono |
| Headlines | Newsreader weight **400** |
| Primary CTA | Filled `#2b59d1` Lake Blue, 6px radius (one per screen) |
| Secondary CTA | Filled `#242424`, 6px radius |
| Ghost | 1px `#242424` border, transparent |
| Cards | 8px radius, 20px padding, 1px `#cecac8`, **no** drop shadow |
| Console | Left sidebar 240px, single column, no bento |
| Decorative pastels | Gradient washes only — never UI fills |

### When building UI

1. Add or extend design tokens in `app/globals.css` (`@theme` + CSS variables)—do not scatter hex values in components.
2. Replace default Geist/create-next-app neutrals and dark-mode auto theming for product pages unless a feature explicitly requires dark UI.
3. Use editorial layout: left-aligned copy, 1432px max width, 240px console sidebar.
4. Buttons/inputs 6px radius; cards 8px. Headlines stay weight 400.

### Do not

- Use bold (600+) headlines.
- Use pure white page backgrounds.
- Scatter Lake Blue beyond the single primary CTA.
- Put a sans-serif on body/UI copy.
- Add card drop shadows or recreate 40px/pill console chrome.

For component-level recipes (footer, hero float cards, suite tabs), use the checklist in `docs/theme.md`.

## Git commits

Only commit when the user asks. Format: `<type>(scope): imperative summary` — types `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style`; HEREDOC for messages; no `--no-verify` unless asked. Full reference: [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md).

## Database migrations

Never edit `prisma/migrations/` manually. Change `schema.prisma`, then `pnpm db:make -- <name>`. Deploy: `pnpm db:migrate`. See [`.agents/rules/database-migrations.md`](./.agents/rules/database-migrations.md).
