---
description: Shared agent policy — follow root AGENTS.md
---

# Shared agent policy

Follow [`AGENTS.md`](../../AGENTS.md) at the repo root for Next.js guidance, Otterscale docs, design theme, git commits, TypeScript standards, and SOLID.

**Modular twins:** [`.agents/rules/`](./) — `typescript-standards.md`, `solid-principles.md`, `theme.md`, `git-commits.md`.

## Before you code

1. Read `node_modules/next/dist/docs/` for anything touching the App Router, server actions, or config (this Next.js version may differ from training data).
2. For product behavior, prefer [`docs/architecture.md`](../../docs/architecture.md) and [`docs/roadmap.md`](../../docs/roadmap.md) over inventing features.
3. Match existing patterns under `app/` and any new packages; do not copy Blueprint/Python layouts (`src/lib/auth/clerk.py`, SQLModel) — this repo is TypeScript-first today with a planned Go control plane.

## Non-negotiables

- **No secrets in git** — `.env`, keys, tokens stay local or in the host secret store.
- **No invented infra** — do not add CDK, Terraform, K8s manifests, or deployment topology unless the user asks or the task is explicitly in `docs/deployment.md` / roadmap.
- **Auth/config fail loud** — if OIDC or required env vars are missing, error at startup or API boundary; no silent “guest mode” or fake logged-in UI.
- **UI** — [`docs/theme.md`](../../docs/theme.md) for all product surfaces.
- **Commits** — only when the user asks; [git-commits.md](./git-commits.md).
- **Scope** — smallest correct diff; one logical change per commit.

## Stack (this repo)

| Area | Standard |
|------|----------|
| Console | Next.js App Router, TypeScript strict, Tailwind v4 tokens in `app/globals.css` |
| Backend (planned) | Go under `cmd/` / `internal/` per architecture doc; Headscale via adapter only |
| Clients | Official Tailscale apps only — no custom VPN client |

When Go services land, apply [solid-principles.md](./solid-principles.md) there too (`internal/headscale` as the only Headscale touchpoint).
