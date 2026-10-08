# Claude Code — Otterscale

Follow repository [`AGENTS.md`](./AGENTS.md) for shared policy, Next.js (read `node_modules/next/dist/docs/`), TypeScript ([`.agents/rules/typescript-standards.md`](./.agents/rules/typescript-standards.md)), and SOLID ([`.agents/rules/solid-principles.md`](./.agents/rules/solid-principles.md)).

## Design system

All visual work must follow the light editorial theme.

- **Canonical spec:** [`docs/theme.md`](./docs/theme.md)
- **Glob rule mirror:** [`.agents/rules/theme.md`](./.agents/rules/theme.md)

### Quick enforcement

| Concern | Rule |
|---------|------|
| Page background | `#f2f0eb` warm parchment |
| Body text | `#292827` ink charcoal |
| Primary CTA | Filled `#421d24` only |
| Secondary CTA | `#d4c7ff` + charcoal border |
| Links | `#714cb6` text only, hover underline |
| Headlines ≥28px | Font weight **460** |
| Cards | White on parchment, 16px radius, **no** drop shadow |
| Dark sections | Full-bleed `#0c4243` only |
| Typography | Super Sans VF → use **Inter** via `next/font` until VF exists |

### When building UI

1. Add or extend design tokens in `app/globals.css` (`@theme` + CSS variables)—do not scatter hex values in components.
2. Replace default Geist/create-next-app neutrals and dark-mode auto theming for product pages unless a feature explicitly requires dark UI.
3. Use editorial layout: left-aligned copy, 1200px max width, generous vertical section gaps (64–96px).
4. Sticky nav: transparent, `backdrop-filter: blur(12px)`, hairline border on scroll.

### Do not

- Use weight 700+ for marketing headlines.
- Put violet on buttons, badges, or icon strokes.
- Introduce blue/green/red accent colors.
- Use `#0c4243` for cards, modals, or sidebars.

For component-level recipes (footer, hero float cards, suite tabs), use the checklist in `docs/theme.md`.

## Git commits

Only commit when the user asks. Format: `<type>(scope): imperative summary` — types `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style`; HEREDOC for messages; no `--no-verify` unless asked. Full reference: [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md).
