# Otterscale roadmap

This roadmap consolidates the [design specification](./external/Otterscale_Design_Architecture.pdf) (v0.5) into **six delivery phases**. Phases overlap in practice; exit criteria are what must be true before calling a phase done.

**Non-negotiables for the whole program:**

- **Official Tailscale clients only** — laptops, phones, and servers use unmodified Tailscale / `tailscaled`; Otterscale provides the console **Connect** area, `otter` helper CLI, and docs—not a branded app.
- **One role-based console** — navigation adapts to role; authorization is always server-side ([theme](./theme.md) for all UI).
- **One Headscale instance per tenant** — environments inside a tenant are tags + compiled policy; strict prod isolation can be a dedicated instance.
- **Compatibility CI** — pinned Headscale, stepwise upgrades, tests against multiple official client versions from Phase 1 onward.

Indicative staffing: one to three full-time engineers; dates are estimates, not commitments.

---

## Phase map (at a glance)

| Phase | Name | Headline outcome |
|-------|------|------------------|
| **1** | Foundations & tenant MVP | Single tenant end-to-end: SSO, devices, groups, environments, policy compiler, audit, Compose quickstart |
| **2** | Multi-tenancy & platform console | Owner / super admins / tenant admins, tenant lifecycle, orchestrator (process driver), platform RBAC |
| **3** | Access product | Requests, approvals, expiring grants, guest share links, notifications, analytics v1 |
| **4** | Automation surface | `otter` CLI/agent, OpenAPI, Go/Python/TypeScript SDKs, Terraform provider |
| **5** | Kubernetes & VPC-like ops | Operator, CRDs, Helm, subnet-router and Argo CD patterns |
| **6** | Connect, polish & GA | Per-OS Connect flows, MDM templates, client-version warnings, security review, v1.0 |

---

## Phase 1 — Foundations & tenant MVP

**Goal:** Prove the control layer on one tenant: intent → compiled HuJSON → Headscale, with a usable console and audit trail.

### Platform & engineering

- [ ] Monorepo layout per spec (`cmd/`, `internal/headscale`, `policy/`, `web/`, `deploy/`, `test/`)
- [ ] CI: Headscale integration harness; matrix of official client versions (minimum per pinned Headscale, e.g. v1.80.0+ for v0.29.x)
- [ ] Headscale adapter: **API only** (gRPC/REST v2)—no shelling out to `headscale` CLI
- [ ] PostgreSQL control DB; SQLite per tenant Headscale instance
- [ ] Reference reverse-proxy config (WebSocket-safe); documented in deployment guide
- [ ] Generated API client from OpenAPI sketch; idempotency keys on writes (design)

### Auth & first tenant

- [ ] OIDC login for humans; scoped API keys for machines (foundation)
- [ ] Single-tenant mode: one active Headscale instance (no Platform area yet, or stub)
- [ ] Tenant workspace: users, groups (manual + IdP group mapping hook)

### Policy compiler (core differentiator seed)

- [x] Intent model: workspaces (ACL groups), tags (`tag:prod`, custom), extra access rules
- [ ] Deterministic HuJSON compile; versioned snapshots with author, time, hash
- [ ] Generated `tests` block; **apply blocked** if policy check fails
- [ ] Diff preview in plain language (who gains/loses access)
- [ ] Debounced apply; lint (wildcards, empty groups, orphan tags)
- [ ] Rollback to prior snapshot (audited)

### Network console (tenant scope)

- [x] Device inventory from Headscale API; filter list by workspace membership (Owner/SA see all)
- [x] Auth keys: workspace + tag multi-select, reusable/ephemeral, expiry
- [x] Tags UI (prod/uat/dev/custom); workspaces isolate peers; strict isolation = separate instance later
- [x] Network Apps: `edge` (Caddy + Go tsnet) reverse-proxies `{subdomain}.{APPS_BASE_DOMAIN}` onto node IP:port (not Funnel)

### Audit

- [ ] Append-only audit log: API mutations, login/MFA, policy apply/rollback
- [ ] Hash chain per tenant; CSV/JSONL export

### Onboarding & packaging

- [ ] First-run wizard (tenant-only): SSO, base domain, default Headscale version, relay map URL
- [ ] Docker Compose quickstart: Postgres + platform + Caddy + optional DERP VM doc
- [ ] Console shell: sticky nav, 1200px layout, [editorial theme](./theme.md)—areas stubbed for later phases

### Phase 1 exit criteria

- A new team can `docker compose up`, sign in with SSO, define groups/environments/rules, apply policy with tests, register a device with an official Tailscale client pointed at the tenant URL, and see actions in the audit log.

---

## Phase 2 — Multi-tenancy & platform console

**Goal:** Full role hierarchy and **N tenants** on one install (process orchestrator first), with isolation tests green.

### Roles & single console

- [ ] **Exactly one Owner** (DB constraint); first-run setup mode with one-time host token, no default password, MFA + recovery codes
- [ ] Owner invites/removes super admins; ownership transfer (two-step + MFA)
- [ ] Super admins: create/suspend/resume/delete tenants; assign tenant admins; fleet health; capacity; upgrades (canary, stepwise Headscale minors)
- [x] Tenant roles for this phase: Admin (workspace) and Member; Owner / Super admin are platform-wide (no NET_ADMIN / AUDITOR)
- [ ] Navigation from API **capability grants**—Platform area requires step-up MFA + banner
- [ ] Tenant switcher (prod / uat / dev spaces or customer tenants) with role badges
- [ ] Install setting: implicit tenant-admin for super admins (on for single-org, off for hosted default)

### Tenancy & orchestration

- [ ] Tenant = one Headscale process (or container later): own SQLite, ports, **non-overlapping CGNAT prefix** per tenant
- [ ] Lifecycle states: `provisioning`, `active`, `suspended`, `pending_delete`, `deleted`
- [ ] **Process driver (all-in-one):** supervisor spawns child Headscale per tenant; hostname routing; shared DERP fleet (no embedded DERP per child)
- [ ] Tenant subdomains / routes; Litestream → object storage for SQLite
- [ ] Platform audit mirrored into affected tenant audit where applicable

### Platform area (UI)

- [ ] Tenants CRUD, quotas/plans (hooks), relay management UI, upgrade orchestration
- [ ] Support sessions: time-boxed, view-only, consented (hosted); break-glass with alert
- [ ] Safeguards: two-person rule for destructive platform actions; KMS-wrapped Headscale API keys never in browser

### RBAC hardening

- [ ] Full permission matrix enforced in `authz` with **per-role API tests in CI**
- [ ] Super admin cannot add super admins; warn when only one super admin exists

### Phase 2 exit criteria

- Owner → super admin → tenant admin flow works end-to-end; two tenants on one all-in-one host with isolated DBs and prefixes; automated tenant isolation tests pass; platform and tenant audit complete for role and lifecycle events.

---

## Phase 3 — Access workflows & analytics

**Goal:** Turn mesh VPN into **access management**: ask, approve, expire, prove.

### Access requests & grants

- [ ] Request: resource/env, duration cap, reason, optional ticket URL
- [ ] Approval policies per environment (auto dev, admin uat, named approver prod; no self-approval)
- [ ] Grant rows with `expires_at`; compiler includes only active grants
- [ ] Reaper (~30s) + debounced recompile on expiry
- [ ] Extend, revoke, break-glass (mandatory reason + alert)
- [ ] Notifications: email; Slack/Teams/Telegram with approve/deny where supported

### Guest & share links

- [ ] Create link: one device, port list, uses, expiry; token stored hashed
- [ ] Redemption flow: rate limits, optional guest verification
- [ ] Ephemeral `tag:guest` nodes; auto cleanup; live session + revoke in console
- [ ] Document limitation: no Tailscale cross-tailnet sharing—guests join as restricted users

### Integration tests (promises)

- [ ] Spike: peer visibility in netmap vs policy ([verify](./open-questions.md))
- [ ] Spike: connection behavior when rules removed (TCP/SSH/long-lived)

### Analytics v1

- [ ] Tenant dashboard: inventory, adoption, request volume, approval latency, stale devices, client version outliers
- [ ] Platform dashboard: tenant counts, upgrade status, Headscale health, resource use
- [ ] Policy lint metrics: unused/over-broad rules
- [ ] Optional agent heartbeat (posture facts)—foundation for later policy
- [ ] **No** flow logs unless optional sampling agent (off by default, disclosed)

### Console UX (workflows)

- [ ] **My access:** devices, request access, share (where role allows)
- [ ] **Workspace:** approvals queue, policy editor (Monaco), groups
- [ ] Editorial UI: tabular numerals for metrics; no violet on buttons—see [theme.md](./theme.md)

### Phase 3 exit criteria

- Request → approve → grant → automatic expiry with audit chain; guest link redeemable once; reaper survives failure injection; analytics dashboards populated from control DB + Headscale API.

---

## Phase 4 — CLI, agent & infrastructure as code

**Goal:** DevOps parity—servers, CI, and repos define the network like a cloud VPC.

### `otter` CLI (helper around official client)

- [ ] Static Go binaries: Linux, macOS, Windows, ARM
- [ ] `otter up` (SSO browser or scoped auth key), `status`, `down`, `logout`, `doctor`
- [ ] `otter accounts list|switch`, `otter envs list`
- [ ] `otter request`, `otter share create`
- [ ] `otter ssh` (mesh, policy-aware)
- [ ] Install script / package channels
- [ ] Agent mode: heartbeat, optional compatibility-window auto-update, optional connection sampling (opt-in)

### Control API v1 (stable)

- [ ] Versioned REST (+ optional gRPC); OpenAPI published
- [ ] Scoped keys; OAuth-style client credentials for machines
- [ ] SSE/WebSocket tenant events (polling Headscale + internal bus until upstream events exist)

### SDKs & Terraform

- [ ] Go SDK (+ embeddable node library using open Tailscale userspace stack where applicable)
- [ ] Python & TypeScript SDKs generated from OpenAPI
- [ ] Terraform / OpenTofu provider: tenants, environments, groups, rules, auth keys
- [ ] Examples in docs matching cloud mental model (VPC = environment)

### Orchestrator: Docker driver

- [ ] One container per tenant; socket proxy hardening for production
- [ ] Migrate tenant from process → docker (data dir copy + route change)

### Phase 4 exit criteria

- Non-interactive server join documented; Terraform applies a group rule and auth key; SDK integration test in CI; `otter doctor` catches common proxy/DERP/DNS issues.

---

## Phase 5 — Kubernetes operator & platform scale

**Goal:** Cluster-native exposure of services and private API access—**Otterscale operator talks to Otterscale API**, not Tailscale SaaS OAuth.

### Operator & CRDs

- [ ] `OtterService` (proxy to `Service`), environment → tags on proxy nodes
- [ ] Subnet router / connector CRDs for private API and multi-cluster (Argo CD patterns doc)
- [ ] Ephemeral CI keys: single-use, `tag:ci`, minimal rules
- [ ] Pin proxy engine to Headscale-supported versions

### Helm & scale-out

- [ ] Helm chart: platform, worker, Postgres external, DERP DaemonSet or external VM
- [ ] Kubernetes orchestrator driver: StatefulSet per tenant
- [ ] Prometheus metrics; dashboards for policy reload latency

### Phase 5 exit criteria

- Sample app exposed via `OtterService` on two K8s distros; Argo CD UAT/prod guide validated; subnet router approval flow documented.

---

## Phase 6 — Connect experience, hardening & v1.0

**Goal:** Frictionless official-client onboarding and production-grade trust.

### Connect area (no custom app)

- [ ] OS detection; links to official store/download pages
- [ ] Per-tenant login URL + copy-paste commands (`tailscale up --login-server …`, `otter up` wrapper)
- [ ] Multi-tenant list for each user; aligns with Tailscale app **account switcher** (one active tenant at a time)
- [ ] QR to mobile setup; per-OS instructions regenerated from templates (versioned with client QA matrix)
- [ ] MDM profile templates (Intune/Jamf) where supported [verify per release]
- [ ] Client version warnings vs Headscale compatibility window
- [ ] Access expiry status in console (device loses reachability when grant expires)

### Hardening & release

- [ ] External security review (control plane, tenant isolation, updater)
- [ ] SECURITY.md, disclosure policy, signed releases, SBOM
- [ ] Upgrade tooling UI (canary tenants, rollback)
- [ ] Documentation complete: runbooks, troubleshooting, trust model for hosted vs self-host
- [ ] Public **v1.0** with AGPL (platform) / Apache (SDK, CLI, operator) licensing decision documented

### Explicitly out of scope (unless demand proves otherwise)

- Custom desktop/mobile clients
- Reimplementing WireGuard data plane or forking Headscale
- Tailscale trademark/logo in product; use “compatible with Tailscale clients”

### Phase 6 exit criteria

- Manual QA matrix green on current Windows/macOS/Linux/Android/iOS clients against pinned Headscale; Connect + MDM docs published; security review remediations closed; v1.0 tag.

---

## Full feature inventory (by domain)

Use this checklist for backlog grooming; phase numbers indicate **first** intended delivery.

| Domain | Feature | Phase |
|--------|---------|-------|
| **Engine** | Headscale adapter (API v2) | 1 |
| **Engine** | Pinned version, stepwise upgrade orchestration | 2 |
| **Engine** | Policy compiler + tests + rollback | 1 |
| **Engine** | Grants syntax where supported | 1–3 |
| **Tenancy** | Instance per tenant | 1–2 |
| **Tenancy** | Soft environments (tags) | 1 |
| **Tenancy** | Strict environment (dedicated instance) | 2 |
| **Tenancy** | IP prefix allocation | 2 |
| **Tenancy** | Process / docker / k8s orchestrator drivers | 2 / 4 / 5 |
| **Roles** | Owner, super admin, tenant admin, net admin, auditor, member, guest | 2–3 |
| **Roles** | Platform step-up MFA | 2 |
| **Roles** | Ownership transfer | 2 |
| **Console** | Platform / Workspace / Network / My access / Audit / Analytics areas | 1–3 |
| **Console** | Connect area | 6 |
| **Console** | Policy Monaco editor, graph view (optional) | 3+ |
| **Console** | Editorial UI ([theme.md](./theme.md)) | 1+ |
| **Access** | Access requests & approvals | 3 |
| **Access** | Time-limited grants + reaper | 3 |
| **Access** | Share links | 3 |
| **Access** | Break-glass | 3 |
| **Audit** | Append-only + hash chain + export | 1 |
| **Audit** | SIEM/webhook scheduled export | 3–6 |
| **Analytics** | Tenant + platform dashboards | 3 |
| **Analytics** | Optional flow sampling | 4+ |
| **Clients** | Official Tailscale apps only | 1+ |
| **Clients** | `otter` CLI/agent | 4 |
| **Clients** | Browser gateway (web SSH/RDP) | Future |
| **IaC** | Terraform provider | 4 |
| **IaC** | SDKs Go/Python/TS | 4 |
| **K8s** | Operator + Helm | 5 |
| **Deploy** | Compose quickstart | 1 |
| **Deploy** | All-in-one image | 2 |
| **Deploy** | DERP/STUN relay image | 1–2 |
| **Deploy** | Litestream backups | 2 |
| **Enterprise hooks** | SCIM, long retention, advanced approval chains | Post-1.0 |

---

## Success metrics (open source)

From the spec’s go/no-go guidance:

- Public alpha (end of Phase 1–2): real teams self-hosting with SSO and compiled policy.
- Beta (Phase 3): access workflows cited as reason to adopt vs Headplane-only UIs.
- v1.0 (Phase 6): compatibility CI green, security review done, docs for Connect on all major OSes.

Re-evaluate if Headscale upstream ships comparable multi-tenancy and approvals, or adoption stalls after alpha.

---

## Related documents

- [Architecture](./architecture.md) — components and data flow
- [Deployment](./deployment.md) — where each part runs
- [Product overview](./product-overview.md) — console & official clients
- [Open questions](./open-questions.md) — spikes before marketing promises
