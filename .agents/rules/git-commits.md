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

- Imperative mood, ≤72 characters in the subject, no trailing period
- One logical change per commit
- Pass the message via HEREDOC (shell)
- No `--no-verify` or amend-after-push unless the user explicitly asks

## Examples

```text
feat(api): add Clerk-backed GET /api/me

Product user id is the Clerk JWT sub so SPA and API share identity.
```

```text
# ❌ BAD
Updated files and fixed stuff
```

## Safety (when committing)

- Never update git config
- No destructive git commands unless the user asks
- Do not commit secrets (`.env`, credentials)
- Prefer a new commit over amend if hooks fail or the commit was not yours / already pushed
