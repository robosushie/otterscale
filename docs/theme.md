# Otterscale design theme (editorial tech journal)

**Theme mode:** light only for product UI  
**Vibe:** Warm parchment canvas, serif headlines at weight 400, monospace UI, one Lake Blue primary action, pill buttons, hairline Ash borders.

This document is the **canonical** design reference for Otterscale. Agent rules in `.cursor/rules/`, `CLAUDE.md`, `CODEX.md`, and `.agents/rules/` summarize this file for tooling.

---

## Principles

- Page canvas is **Parchment** (`#f6f3f1`), never pure white for full-page backgrounds.
- **Off-Black** (`#242424`) for primary text and secondary filled buttons.
- **Lake Blue** (`#2b59d1`) is the **only** chromatic filled primary button — one per screen.
- Headlines use an editorial **serif at weight 400** — never bold.
- Body, nav, buttons, labels, and all functional UI use **monospace**.
- Buttons and tags are **pills** (100px / 9999px radius). Cards are **40px** radius with **40px** padding.
- Depth from 1px Ash borders and parchment vs periwinkle contrast — not drop shadows on cards.
- Pastel stops (sky, mint, coral, gold, crimson) are **decorative washes only**, never UI fills.

---

## Color tokens

| Name | Value | CSS token | Role |
|------|-------|-----------|------|
| Parchment | `#f6f3f1` | `--color-parchment` | Page canvas and default surfaces |
| Lake Blue | `#2b59d1` | `--color-lake-blue` | Single primary CTA fill |
| Periwinkle Mist | `#cfdaf5` | `--color-periwinkle-mist` | Elevated / emphasis card, disabled wash |
| Sky Blue | `#a0b5eb` | `--color-sky-blue` | Decorative gradient stop only |
| Mint | `#a7fccd` | `--color-mint` | Decorative accent only |
| Coral | `#ff9473` | `--color-coral` | Decorative accent only |
| Gold | `#ecda98` | `--color-gold` | Decorative gradient stop only |
| Crimson | `#f37a0a` | `--color-crimson` | Decorative gradient stop only |
| Off-Black | `#242424` | `--color-off-black` | Text, secondary filled buttons |
| Ink | `#000000` | `--color-ink` | Announcement bar only |
| Graphite | `#4e4d4d` | `--color-graphite` | Secondary body / helper |
| Smoke | `#797776` | `--color-smoke` | Tertiary / muted helper |
| Ash | `#cecac8` | `--color-ash` | Hairline borders and dividers |
| Paper | `#ffffff` | `--color-paper` | Elevated dialogs and cards that must lift off parchment |

### Surfaces

| Level | Name | Value |
|-------|------|-------|
| 1 | Parchment | `#f6f3f1` |
| 2 | Periwinkle Mist | `#cfdaf5` |
| 3 | Off-Black | `#242424` |
| 4 | Ink | `#000000` |

---

## Typography

**Display / headings:** editorial serif (`--font-display`). Substitute in code: **Instrument Serif** via `next/font`. Weight **400** at every size.

**Body / UI:** monospace (`--font-ui`). Substitute: **IBM Plex Mono**. Weights 400 and 500 (500 for emphasized labels). Buttons, nav, badges, tags: uppercase + tight tracking.

| Role | Family | Size | Line height | Letter spacing | Weight |
|------|--------|------|-------------|----------------|--------|
| caption | mono | 12px | 1.2 | -0.4px | 400 |
| body-sm | mono | 14px | 1.35 | -0.28px | 400 |
| body | mono | 16px | 1.35 | -0.4px | 400 |
| label | mono | 18px | 1.2 | -0.4px | 400–500 |
| body-lg | mono | 20px | 1.35 | -0.4px | 400 |
| subheading | serif | 24px | 1.2 | -0.48px | 400 |
| heading-sm | serif | 32px | 1.2 | -0.64px | 400 |
| heading | serif | 40px | 1.2 | -0.8px | 400 |
| heading-lg | serif | 48px | 1.2 | -0.96px | 400 |
| display | serif | 80px | 1.2 | -1.6px | 400 |

The pairing is the identity: serif announces, mono instructs. Do not put headings in sans-serif or body in a proportional sans.

---

## Spacing and layout

- **Base unit:** 8px
- **Page max-width:** 1432px
- **Section gap:** 64px
- **Card padding:** 40px
- **Element gap:** 16px

Scale: 8, 16, 24, 32, 40, 64, 72, 80.

### Border radius

| Element | Radius |
|---------|--------|
| tags, pills | 9999px |
| buttons | 100px |
| cards | 40px |

### Shadows

Avoid card elevation shadows. Optional ambient only: `--shadow-md: rgba(0, 0, 0, 0.1) 0px 0px 10px 0px`.

---

## Components (implementation checklist)

### Primary pill (Lake Blue)

- Fill `#2b59d1`, text parchment/white, IBM Plex Mono 14px **uppercase**, radius 100px
- Padding 16px 32px, height ~48px
- Optional trailing ▸
- **Only** saturated fill in the system — one primary per screen

### Secondary pill (Off-Black)

- Fill `#242424`, white/parchment text, same type and radius as primary, no arrow

### Ghost pill

- Transparent, 1px `#242424` border, Off-Black uppercase mono 14px, radius 100px, padding 16px 32px

### Feature card

- Parchment (or transparent) fill, 1px Ash border, 40px radius, 40px padding
- Title: serif 24px / 400 / Off-Black
- Body: mono 16px / Graphite
- No drop shadow

### Elevated card (Periwinkle)

- `#cfdaf5` fill, 40px radius, 40px padding — the one colored card that draws the eye

### Navigation

- Parchment/transparent, ~80px height
- Wordmark left; nav links IBM Plex Mono 18px uppercase Off-Black
- Right: ghost Login + Lake Blue primary

### Announcement bar

- Full-bleed Ink `#000000`, parchment text, ~40px tall — the only ink-black band

---

## Do's and don'ts

**Do**

- Serif weight 400 for all headings; tracking about −0.02em.
- Monospace for every functional string (body, buttons, nav, tags).
- Pill radius on buttons/tags; 40px cards.
- Parchment canvas; Ash 1px borders.
- One Lake Blue primary action per screen.

**Don't**

- Bold (600+) headlines.
- Pure white page background.
- Lake Blue on anything except the primary CTA.
- Sans-serif body copy.
- Card drop shadows; sharp radii under 16px on cards or under 100px on buttons.
- Pastels as functional UI fills.

---

## Implementation (Next.js + Tailwind v4)

Tokens live in `app/globals.css` (`:root` + `@theme`). Fonts in `app/layout.tsx`: Instrument Serif → `--font-display`, IBM Plex Mono → `--font-ui`.

### Quick color reference

| Role | Hex |
|------|-----|
| canvas | `#f6f3f1` |
| text | `#242424` |
| secondary text | `#4e4d4d` |
| muted | `#797776` |
| border | `#cecac8` |
| primary CTA | `#2b59d1` |
| secondary button | `#242424` |
| emphasis surface | `#cfdaf5` |
