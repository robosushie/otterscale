---
trigger: glob
description: Otterscale editorial UI theme (colors, typography, components)
globs: app/**/*.{tsx,css},**/*.css
---

# Theme (Otterscale)

Canonical reference: @docs/theme.md

When editing UI in `app/` or global styles, follow the light editorial tech-journal system in `docs/theme.md`.

## Colors

| Role | Hex | Token |
|------|-----|-------|
| Canvas | `#f6f3f1` | `--color-parchment` |
| Text | `#242424` | `--color-off-black` |
| Secondary text | `#4e4d4d` | `--color-graphite` |
| Muted | `#797776` | `--color-smoke` |
| Border | `#cecac8` | `--color-ash` |
| Primary CTA | `#2b59d1` | `--color-lake-blue` |
| Secondary button | `#242424` | `--color-off-black` |
| Emphasis surface | `#cfdaf5` | `--color-periwinkle-mist` |
| Announcement bar | `#000000` | `--color-ink` |

## Rules

1. **Primary button** — Lake Blue fill, parchment/white uppercase mono 14px, 6px radius, one per screen.
2. **Secondary button** — Off-Black fill, same 6px radius.
3. **Ghost** — 1px Off-Black border, transparent fill, uppercase mono.
4. **Headlines** — editorial serif weight 400 only (Instrument Serif). Never bold.
5. **Body / UI** — IBM Plex Mono for all functional text.
6. **Cards** — 8px radius, 20px padding, 1px Ash border, no drop shadow.
7. **Console** — left sidebar (240px), single column, no bento grids.
8. **Forbidden** — white page background, extra chromatic button colors, sans-serif body, pastel as UI fills, card shadows, 40px/pill console chrome.

## Implementation

- Tokens in `app/globals.css` (`:root` + Tailwind v4 `@theme`).
- Fonts in `app/layout.tsx`: Instrument Serif + IBM Plex Mono.
- Max content width 1432px; sidebar 240px.

Before shipping UI changes, skim the checklist in @docs/theme.md.
