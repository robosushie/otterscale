---
description: SOLID design principles for Otterscale (TypeScript console, Go services)
---

# SOLID principles

Apply **incrementally** — one refactor at a time, with tests. SOLID is guidance for change-prone code, not mandatory interfaces everywhere.

Sources: Robert C. Martin (SOLID); practical TypeScript treatment ([Stack Practices SOLID](https://stackpractices.com/patterns/solid-principles-typescript/), [Strapi SOLID guide](https://strapi.io/blog/solid-design-principles-javascript-typescript-guide)).

## S — Single Responsibility

One module, one **reason to change** (one actor or one bounded capability).

| Do | Don't |
|----|--------|
| Split UI / data fetch / policy mapping / Headscale HTTP | One “god” service that does auth + CRUD + compile + notify |
| Small files under `app/` for routes; lib in `lib/` or `internal/` | 800-line `page.tsx` with business rules |

**Otterscale:** Policy **compiler**, **Headscale adapter**, and **HTTP handlers** stay separate packages (`internal/policy`, `internal/headscale`, API layer) per [architecture.md](../../docs/architecture.md).

## O — Open/Closed

Open for **extension**, closed for **modification**.

- Add new approval rules, notification channels, or orchestrator drivers via **new types/strategies**, not `switch` edits across the codebase.
- Prefer config + strategy registration over editing core compiler loops for each customer rule.

```typescript
// ✅ New channel = new class implementing the port
interface AccessNotifier {
  notifyApprovalNeeded(event: ApprovalEvent): Promise<void>;
}
```

## L — Liskov Substitution

Subtypes must honor the **contract** of the abstraction.

- If `HeadscaleClient` is mocked in tests, the fake must satisfy the same pre/post conditions (errors, idempotency) as the real adapter.
- Do not strengthen preconditions or weaken guarantees in subclasses or test doubles.

## I — Interface Segregation

Many **small ports** beat one fat interface.

```typescript
// ❌ Fat port forces unused methods
interface Storage {
  saveUser(): Promise<void>;
  savePolicy(): Promise<void>;
  exportAudit(): Promise<void>;
}

// ✅ Callers depend on what they use
interface PolicySnapshotStore {
  append(snapshot: PolicySnapshot): Promise<void>;
}
```

React: split props interfaces so presentational components do not depend on server-only fields.

## D — Dependency Inversion

**High-level policy** depends on **abstractions**; implementations injected at the **composition root**.

- Console pages and route handlers depend on **ports** (`TenantRepository`, `AuthSession`, `HeadscaleAdmin`), not fetch calls to Headscale URLs scattered in UI.
- Wire concrete adapters once: `app` layout, server bootstrap, or Go `main` — not inside leaf components.
- **Constructor injection** (classes) or **factory parameters** (functions) is enough; use a DI container only when wiring becomes large (Go: explicit `main`; TS: prefer manual wiring in server modules).

```typescript
// Domain/service depends on port
class PolicyApplyService {
  constructor(
    private readonly headscale: HeadscaleAdminPort,
    private readonly compiler: PolicyCompilerPort,
    private readonly audit: AuditWriterPort,
  ) {}
}

// Composition root (e.g. server-only module)
const policyApply = new PolicyApplyService(headscaleAdapter, compiler, auditLog);
```

**Tests:** inject in-memory fakes of the same ports — no network, no SQLite.

## Layering (Otterscale target)

```text
UI (Next.js) → application services → ports (interfaces)
                                      ↑
                              adapters (Headscale API, Postgres, OIDC)
```

- **Only** `internal/headscale` talks to Headscale (mirrors “adapter only” rule in architecture).
- UI never imports Headscale client types or raw HuJSON manipulation — use API + typed DTOs.

## Go services (when added)

Same letters, idiomatic Go:

- **SRP:** package per capability (`policy`, `access`, `tenancy`); small interfaces in consumer packages.
- **DIP:** `internal/headscale` implements interfaces defined by callers; inject via struct fields in `cmd/platform`.
- **OCP:** new orchestrator driver = new file implementing `Orchestrator` interface, register in `main`.
- Avoid premature abstraction — one implementation and no second caller → concrete type is fine until a test or second driver appears.

## When not to over-apply

- Do not introduce interfaces for every function — extract when you have **two implementations** or **tests need a fake**.
- Do not split files for splitting’s sake; split when **merge conflicts** or **multiple stakeholders** prove the pain.

## Checklist before merge

- [ ] New external system (DB, Headscale, IdP) touched only in an adapter?
- [ ] Business rule change possible without editing unrelated UI?
- [ ] Can unit-test the service with mocks of ports?
- [ ] File has a single clear name matching its one job?
