# Codex — Otterscale instructions

Layer this file with [`AGENTS.md`](./AGENTS.md) (shared policy, Next.js, TypeScript, SOLID) when working in this repository. Details: [`.agents/rules/typescript-standards.md`](./.agents/rules/typescript-standards.md), [`.agents/rules/solid-principles.md`](./.agents/rules/solid-principles.md).

## Design system (required for UI)

Canonical theme: [`docs/theme.md`](./docs/theme.md)

Otterscale uses a light editorial tech-journal theme (parchment canvas, serif headlines, mono UI).

### Token summary

```
canvas:       #f6f3f1  (--color-parchment)
text:         #242424  (--color-off-black)
muted:        #4e4d4d  (--color-graphite)
helper:       #797776  (--color-smoke)
border:       #cecac8  (--color-ash)
primary CTA:  #2b59d1  (--color-lake-blue) — sole chromatic filled button
secondary:    #242424  (--color-off-black)
emphasis:     #cfdaf5  (--color-periwinkle-mist)
```

### Typography

- Headlines: Instrument Serif (`--font-display`), weight 400 only.
- Body, nav, buttons, labels: IBM Plex Mono (`--font-ui`). Buttons/nav uppercase.

### Component defaults

| Component | Key styles |
|-----------|------------|
| Primary button | `#2b59d1` bg, parchment text, 6px radius, uppercase 14px |
| Secondary button | `#242424` bg, parchment text, 6px radius |
| Ghost | Transparent, 1px `#242424` border, 6px radius |
| Card | Paper, 8px radius, 20px padding, 1px Ash, no shadow |
| Console | Left sidebar 240px, single column |

### Implementation location

- Tokens: `app/globals.css`
- Fonts: `app/layout.tsx` — Instrument Serif + IBM Plex Mono

### Hard rejects

- Card elevation shadows.
- Extra chromatic button fills.
- Bold headlines.
- Pure white page background.
- Sans-serif body copy.

When unsure, read `docs/theme.md` before adding new components.

## Git commits

Only commit when the user asks. Conventional commits per [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md) (`feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style`; imperative ≤72 chars; HEREDOC; no `--no-verify` unless the user asks).
