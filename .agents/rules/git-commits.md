---
description: Conventional commit message format for this repo
---

# Git commits

Only commit when the user asks.

## Format

```text
<type>(optional-scope): <imperative summary>

Optional body: why, not a file list.
```

**Types:** `feat` | `fix` | `refactor` | `chore` | `docs` | `test` | `style`

## Rules

- Imperative mood, no trailing period
- **Subject length is hard-limited to 81 characters**, including the type and scope. CI commits rejects a longer pull request title and every commit subject on the PR. The local hook `.githooks/commit-msg` rejects the commit when the subject is longer than 81. Put the rest in the body.
- One logical change per commit
- Pass the message via HEREDOC (shell)
- No `--no-verify` or amend-after-push unless the user explicitly asks

## Examples

```text
feat(api): add OIDC session for GET /api/me

Subject is the IdP sub so console and API share identity.
```

```text
# ❌ BAD — over 81 characters
feat: add workspaces field to user invites and enhance user management components today

# ❌ BAD
Updated files and fixed stuff
```

## Safety (when committing)

- Never update git config
- No destructive git commands unless the user asks
- Do not commit secrets (`.env`, credentials)
- Prefer a new commit over amend if hooks fail or the commit was not yours / already pushed
