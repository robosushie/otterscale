# Codex — Otterscale instructions

Layer this file with [`AGENTS.md`](./AGENTS.md) (shared policy, Next.js, TypeScript, SOLID) when working in this repository. Details: [`.agents/rules/typescript-standards.md`](./.agents/rules/typescript-standards.md), [`.agents/rules/solid-principles.md`](./.agents/rules/solid-principles.md).

## Design system (required for UI)

Canonical theme: [`docs/theme.md`](./docs/theme.md)

Otterscale uses the golden-hour editorial theme (light mode).

### Token summary

```
canvas:       #f2f0eb  (--color-warm-parchment)
text:         #292827  (--color-ink-charcoal)
muted:        #666666  (--color-stone-gray)
border:       #e3e3e2  (--color-soft-mist)
card:         #ffffff  (--color-paper-white)
link:         #714cb6  (--color-royal-violet) — links ONLY
primary CTA:  #421d24  (--color-midnight-wine) — sole filled chromatic button
secondary:    #d4c7ff  (--color-lilac-mist) + 1px #292827 border
dark band:    #0c4243  (--color-deep-lagoon) — full-bleed sections only
```

### Typography

- Single family: Super Sans VF (`--font-super-sans-vf`); implement with **Inter** until VF is hosted.
- Weights: 460 (display/headlines/body), 540 (emphasis), 700 (small labels only e.g. 19px product names).
- Display scale: 64 / 49 / 28 / 26 / 19 / 16 / 14 / 12 — see `docs/theme.md` for line-height and tracking.

### Component defaults

| Component | Key styles |
|-----------|------------|
| Primary button | `#421d24` bg, white text, 16px radius, h~48, weight 460 |
| Secondary button | `#d4c7ff` bg, `#292827` text, 8px radius, 1px border |
| Ghost / nav | Transparent, charcoal, underline on hover |
| Product card | White, 16px radius, 16px padding, violet learn-more link |
| Hero float card | White ~85% opacity, 16px radius, no shadow |
| Header | 64px sticky, blur(12px), border `#e3e3e2` on scroll |

### Implementation location

- Tokens: `app/globals.css` — Tailwind v4 `@import "tailwindcss"` + `@theme { ... }`.
- Fonts: `app/layout.tsx` — load Inter (variable) as `--font-super-sans-vf` fallback.
- Avoid leaving create-next-app `#171717` / dark `prefers-color-scheme` as the product default.

### Hard rejects

- Card elevation shadows.
- Violet or lilac **primary** filled CTAs (wine only).
- Bold headlines (700+) at display sizes.
- Pure black text or pure white page background.

When unsure, read `docs/theme.md` before adding new components.

## Git commits

Only commit when the user asks. Conventional commits per [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md) (`feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style`; imperative ≤72 chars; HEREDOC; no `--no-verify` unless the user asks).
