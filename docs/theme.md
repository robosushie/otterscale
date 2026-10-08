# Otterscale design theme (golden hour editorial)

**Theme mode:** light only for product UI  
**Vibe:** Warm parchment canvas, weight-460 headlines, maroon primary actions, violet links only, depth from photography and layering—not card drop shadows.

This document is the **canonical** design reference for Otterscale. Agent rules in `.cursor/rules/`, `CLAUDE.md`, `CODEX.md`, and `.agents/rules/` summarize this file for tooling.

---

## Principles

- Page canvas is **Warm Parchment** (`#f2f0eb`), never pure white for full-page backgrounds.
- **Ink Charcoal** (`#292827`) for primary text—never `#000000`.
- **Midnight Wine** (`#421d24`) is the **only** chromatic filled primary button color.
- **Royal Violet** (`#714cb6`) is **only** for inline links and emphasized link phrases—not button fills, badges, or icon strokes.
- Headlines at **28px and above** use font weight **460** (not 700).
- No drop shadows on cards; use borders (`#e3e3e2`) and surface contrast instead.
- **Deep Lagoon** (`#0c4243`) is reserved for full-bleed dark feature bands—not cards or nav.

---

## Color tokens

| Name | Value | CSS token | Role |
|------|-------|-----------|------|
| Midnight Wine | `#421d24` | `--color-midnight-wine` | Primary CTAs, announcement banner, footer |
| Royal Violet | `#714cb6` | `--color-royal-violet` | Links, tags, short emphasis (text only) |
| Lilac Mist | `#d4c7ff` | `--color-lilac-mist` | Secondary button fill, selected tab, ghost accents |
| Deep Lagoon | `#0c4243` | `--color-deep-lagoon` | Dark storytelling band (full-bleed) |
| Warm Parchment | `#f2f0eb` | `--color-warm-parchment` | Page canvas |
| Soft Mist | `#e3e3e2` | `--color-soft-mist` | Borders, dividers |
| Ink Charcoal | `#292827` | `--color-ink-charcoal` | Headings, body, icons |
| Stone Gray | `#666666` | `--color-stone-gray` | Secondary / helper text (sparingly) |
| Paper White | `#ffffff` | `--color-paper-white` | Elevated cards, floating UI on parchment |

### Surfaces

| Level | Name | Value |
|-------|------|-------|
| 0 | Parchment canvas | `#f2f0eb` |
| 1 | Paper card | `#ffffff` |
| 2 | Lilac wash | `#d4c7ff` |
| 3 | Deep Lagoon band | `#0c4243` |
| 4 | Wine ground | `#421d24` |

---

## Typography

**Font:** Super Sans VF (`--font-super-sans-vf`) everywhere.  
**Substitute in code until VF is licensed/hosted:** Inter variable (closest open substitute).

| Role | Size | Line height | Letter spacing | Weight |
|------|------|-------------|----------------|--------|
| caption | 12px | 1.5 | 0 | 460–540 |
| body-sm | 14px | 1.5 | 0 | 460 |
| body | 16px | 1.2 | 0 | 460 |
| label-bold | 19px | 1.5 | 0 | 700 |
| subheading | 26px | 1.3 | — | 460 |
| heading-sm | 28px | 1.14 | -0.62px | 460 |
| heading-lg | 49px | 1.2 | -1.32px | 460 |
| display | 64px | 0.96 | -1.8px | 460 |

Tight tracking at large sizes; **0** letter-spacing at 16px and below.

OpenType: `"ss01"` when supported; tabular numerals for data-heavy UI.

---

## Spacing and layout

- **Base unit:** 4px (`--spacing-unit`)
- **Page max-width:** 1200px
- **Section gap:** 64–96px
- **Card padding:** 16px
- **Element gap:** 8px

Scale: 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 64, 80, 96 (see CSS variables in implementation section).

### Border radius

| Element | Radius |
|---------|--------|
| tabs | 8px |
| small buttons | 8px |
| cards, buttons, floating cards | 16px |
| pills | 999px |

### Shadows

Avoid elevation shadows. Optional inset only: `--shadow-subtle: rgb(113, 76, 182) 0px 0px 0px 1px inset`.

---

## Components (implementation checklist)

### Primary action button

- Background `#421d24`, text `#ffffff`, 16px weight 460
- Radius 16px, ~48px height, horizontal padding 12px+
- Optional arrow icon with 8px gap
- **Only** filled chromatic button in the system

### Outlined light button (secondary)

- Background `#d4c7ff`, text `#292827`, border 1px `#292827`
- Radius 8px, padding 6px 16px

### Ghost text button

- Transparent, `#292827`, no border; underline on hover for nav / tertiary

### Link with underline

- Color `#714cb6`, weight 460, 16px; underline on hover (0.2s ease)

### Navigation header

- Sticky ~64px; transparent + `backdrop-filter: blur(12px)`
- 1px `#e3e3e2` bottom border on scroll
- Center links: 16px weight 460; right: ghost actions + lilac outlined sign-up

### Floating product card (hero)

- `#ffffff` at ~85% opacity, 16px radius, 16px padding
- Border `1px solid rgba(255,255,255,0.2)`; **no** drop shadow

### Suite tab strip

- White container, 8px outer radius; active tab `#d4c7ff`

### Suite product card

- White card on parchment, 16px radius, 16px padding; violet “Learn more” link

### Dark feature band

- Full-bleed `#0c4243`; white type; white-outlined ghost CTA

### Footer

- Full-bleed `#421d24`; headings white; links ~70% white opacity; 64px vertical padding

---

## Imagery and layout rhythm

- Hero: full-bleed warm, golden-hour photography; floating glass cards over image.
- Trust logos: white cells, `#e3e3e2` borders, monochrome logos.
- Scroll rhythm: photo hero → quiet cream/white content → Deep Lagoon band → gradient atmosphere → wine footer.
- Icons: minimal monochrome line, ~16–20px, single stroke weight.

Left-align headlines and body longer than two lines.

---

## Do's and don'ts

**Do**

- Use weight 460 for headlines ≥28px.
- Body on parchment; white cards only where elevation is needed.
- Header blur + scroll border.
- Reserve violet for links.

**Don't**

- Bold (700+) headlines.
- Card drop shadows or blue/green/red accents.
- Deep Lagoon outside full-bleed bands.
- Violet as button fill.
- Pure white page background or pure black text.

---

## Implementation (Next.js + Tailwind v4)

Define tokens in `app/globals.css` (Tailwind `@theme` + `:root`). Prefer semantic Tailwind classes mapped to tokens (e.g. `bg-warm-parchment`, `text-ink-charcoal`) once registered.

### CSS custom properties

```css
:root {
  --color-midnight-wine: #421d24;
  --color-royal-violet: #714cb6;
  --color-lilac-mist: #d4c7ff;
  --color-deep-lagoon: #0c4243;
  --color-warm-parchment: #f2f0eb;
  --color-soft-mist: #e3e3e2;
  --color-ink-charcoal: #292827;
  --color-stone-gray: #666666;
  --color-paper-white: #ffffff;

  --font-super-sans-vf: "Super Sans VF", Inter, ui-sans-serif, system-ui, sans-serif;

  --text-caption: 12px;
  --leading-caption: 1.5;
  --text-body-sm: 14px;
  --leading-body-sm: 1.5;
  --text-body: 16px;
  --leading-body: 1.2;
  --text-label-bold: 19px;
  --leading-label-bold: 1.5;
  --text-subheading: 26px;
  --leading-subheading: 1.3;
  --text-heading-sm: 28px;
  --leading-heading-sm: 1.14;
  --tracking-heading-sm: -0.62px;
  --text-heading-lg: 49px;
  --leading-heading-lg: 1.2;
  --tracking-heading-lg: -1.32px;
  --text-display: 64px;
  --leading-display: 0.96;
  --tracking-display: -1.8px;

  --font-weight-w460: 460;
  --font-weight-w540: 540;
  --font-weight-bold: 700;

  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-36: 36px;
  --spacing-40: 40px;
  --spacing-48: 48px;
  --spacing-64: 64px;
  --spacing-80: 80px;
  --spacing-96: 96px;

  --page-max-width: 1200px;
  --section-gap-min: 64px;
  --section-gap-max: 96px;
  --card-padding: 16px;
  --element-gap: 8px;

  --radius-tabs: 8px;
  --radius-cards: 16px;
  --radius-pills: 999px;
  --radius-buttons: 16px;
  --radius-small-buttons: 8px;

  --shadow-subtle: rgb(113, 76, 182) 0px 0px 0px 1px inset;

  --surface-parchment-canvas: #f2f0eb;
  --surface-paper-card: #ffffff;
  --surface-lilac-wash: #d4c7ff;
  --surface-deep-lagoon-band: #0c4243;
  --surface-wine-ground: #421d24;
}
```

### Tailwind v4 `@theme` block

Mirror the same color, type, spacing, and radius tokens in `@theme { ... }` inside `app/globals.css` so utilities stay aligned with CSS variables (see agent rules for the abbreviated list).

---

## Quick color reference

| Role | Hex |
|------|-----|
| canvas | `#f2f0eb` |
| text | `#292827` |
| secondary text | `#666666` |
| border | `#e3e3e2` |
| card | `#ffffff` |
| link | `#714cb6` |
| primary CTA fill | `#421d24` |
| secondary button / selected | `#d4c7ff` |
| dark band | `#0c4243` |

---

## Related brands (tone reference)

Notion, Arc Browser, Linear (light editorial patterns), Stripe (gradient bands), Causal (cream + maroon punctuation).
