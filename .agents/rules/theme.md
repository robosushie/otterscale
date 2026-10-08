---
trigger: glob
description: Otterscale editorial UI theme (colors, typography, components)
globs: app/**/*.{tsx,css},**/*.css
---

# Theme (Otterscale)

Canonical reference: @docs/theme.md

When editing UI in `app/` or global styles, follow the light editorial system in `docs/theme.md`.

## Colors

| Role | Hex | Token |
|------|-----|-------|
| Canvas | `#f2f0eb` | `--color-warm-parchment` |
| Text | `#292827` | `--color-ink-charcoal` |
| Muted | `#666666` | `--color-stone-gray` |
| Border | `#e3e3e2` | `--color-soft-mist` |
| Card | `#ffffff` | `--color-paper-white` |
| Link | `#714cb6` | `--color-royal-violet` |
| Primary CTA | `#421d24` | `--color-midnight-wine` |
| Secondary fill | `#d4c7ff` | `--color-lilac-mist` |
| Dark band | `#0c4243` | `--color-deep-lagoon` |

## Rules

1. **Primary button** — wine fill, white label, 16px radius, ~48px tall, weight 460.
2. **Secondary button** — lilac fill, charcoal text, 1px charcoal border, 8px radius.
3. **Links** — violet text only; underline on hover (0.2s).
4. **Headlines** — weight 460 from 28px up; display sizes use negative tracking from theme doc.
5. **Surfaces** — parchment page background; white cards for elevation only.
6. **Depth** — no drop shadows on cards; hero floats use translucent white over photography.
7. **Header** — sticky, blur(12px), soft-mist border when scrolled.
8. **Forbidden** — pure `#000` / `#fff` page bg, violet button fills, extra accent hues, 700-weight headlines, shadows on cards, deep lagoon on components.

## Implementation

- Centralize tokens in `app/globals.css` (`:root` + Tailwind v4 `@theme`).
- Font: Inter as substitute for Super Sans VF until custom VF is wired in `layout.tsx`.
- Max content width 1200px; section spacing 64–96px.

Before shipping UI changes, skim component checklist in @docs/theme.md.
