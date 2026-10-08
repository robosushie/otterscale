---
description: TypeScript and Next.js coding standards (Otterscale console)
globs: "**/*.{ts,tsx,mts}"
---

# TypeScript standards

Canonical compiler baseline: [`tsconfig.json`](../../tsconfig.json) (`strict: true`). Align with [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting) and [Next.js ESLint](https://nextjs.org/docs/app/api-reference/config/eslint) as the repo adopts stricter presets.

References: [TypeScript handbook strictness](https://www.typescriptlang.org/tsconfig#strict), community practice (strict + `noUncheckedIndexedAccess`, type-aware ESLint).

## Compiler & lint

- Keep **`strict: true`**. Prefer enabling when the team agrees: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`.
- Run **`pnpm lint`** before finishing; fix new violations in touched files.
- Prefer **type-aware** ESLint rules (`recommendedTypeChecked` / `strictTypeChecked`) when upgrading `eslint.config.mjs` — use `parserOptions.projectService: true`.
- **Formatting:** let the project formatter win; ESLint for bugs and unsafe patterns, not stylistic bikeshedding.

## Types

- **`unknown` over `any`**. Narrow with type guards, `zod`, or schema validation at boundaries (API, env, JSON).
- Annotate **public function return types** on exported helpers and server actions for clearer errors.
- Use **discriminated unions** for UI state, API results, and loading/error/success flows.
- Prefer **`satisfies`** and **`as const`** for config objects and design tokens instead of wide casts.
- Avoid non-null assertions (`!`) unless invariant is documented in code or validated immediately above.
- Use **`readonly`** / readonly arrays for props and DTOs that must not mutate.
- **Branded types** (optional) for tenant IDs, slugs, and auth subject strings when crossing layers.

## Modules & imports

- Path alias **`@/*`** per tsconfig — use consistently for app code.
- **Named exports** for utilities; default export only for Next.js `page.tsx` / `layout.tsx` where required.
- No barrel files that re-export entire trees unless there is a clear boundary (avoid circular imports).
- Side effects only in explicit entry points (instrumentation, root layout providers).

## Next.js App Router

- **`"use client"`** only when needed (hooks, browser APIs, event handlers). Keep data fetching and secrets on the server.
- **Server Components** default: fetch on server; pass serializable props to client children.
- **Server Actions:** validate input; never trust client; map errors to safe user messages; no secret leakage in thrown errors.
- **Route handlers (`route.ts`):** treat as public HTTP — auth check first, typed request/response, correct status codes.
- **Env:** use `process.env` via typed helpers; **fail at module init or first request** if required vars missing — do not render a broken auth shell.
- Read **`node_modules/next/dist/docs/`** before changing caching, `fetch` options, middleware, or `next.config.ts`.

## React

- Functional components; hooks rules enforced.
- Derive state when possible; avoid duplicating server data in client state without sync strategy.
- **`key`** stability for lists; avoid index keys when identity exists.
- Accessibility: semantic HTML, labels, focus for interactive controls (product UI also follows [theme.md](../../docs/theme.md)).

## Errors & async

- **`async/await`** with try/catch at boundaries; do not swallow errors.
- Return **Result-style** unions or typed errors from lib code instead of throwing across module boundaries when callers need to branch.
- Never empty `catch` blocks.

## Tests (when added)

- Prefer **`*.test.ts(x)`** colocated or under `test/`; use fakes at ports (see SOLID doc), not full integration in unit tests.

## Anti-patterns

```typescript
// ❌ any at API boundary
const body = await req.json() as any;

// ✅ validate then use
const body: unknown = await req.json();
const parsed = createTenantSchema.parse(body);
```

```typescript
// ❌ optional env with silent default for auth
const issuer = process.env.OIDC_ISSUER ?? "https://example.com";

// ✅ fail loud
const issuer = requireEnv("OIDC_ISSUER");
```
