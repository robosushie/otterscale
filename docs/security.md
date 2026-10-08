# Otterscale security

The control plane decides **who can reach what** on the mesh. Compromise of Otterscale or a tenant’s Headscale admin API is effectively **network compromise**. Treat the platform like an identity provider.

Reference: design spec §17; RBAC §7–9 in [PDF](./external/Otterscale_Design_Architecture.pdf).

---

## Trust model

| Party | Can read traffic? | Can change access? |
|-------|-------------------|---------------------|
| Device users | End-to-end encrypted mesh traffic among their peers | Only via permitted actions (requests, own keys) |
| Tenant admin | No packet contents | Yes, within tenant policy |
| Platform operator (hosted) | No packet contents | Can change **policy** for tenants they manage—publish honestly |
| Self-hoster | Same as operator | Usually same team as tenant admins |

Otterscale audit is **control-plane** evidence (who changed access), not flow logs, unless optional sampling agent is enabled with disclosure.

---

## Threat matrix

| Threat | Mitigation |
|--------|------------|
| Stolen admin session / API key | OIDC + MFA, short sessions, step-up for Platform and destructive actions, scoped expiring API keys, optional IP allow-list |
| Leaked Headscale API key (platform store) | Per-tenant keys, envelope encryption (KMS), keys never sent to browser; Headscale admin on private network only |
| Cross-tenant data leak | Tenant ID on every row; data-layer enforcement; instance-per-tenant; isolation tests in CI |
| Policy mistake (lockout or over-open) | Compiler tests block apply; diff preview; staged apply; rollback; Owner break-glass |
| Share link abuse | Hashed tokens, constant-time compare, narrow ports, short TTL, rate limits, revoke, redemption alerts |
| Audit tampering | Append-only store, hash chain per tenant, periodic anchor of chain head to object storage / transparency log |
| Malicious `otter` binary | Signed releases, update verification, SBOM |
| Dependency CVEs | Pinned versions, automated updates, SECURITY.md contact |
| DoS on coordination | Edge rate limits, per-tenant quotas, isolated Headscale processes |
| Owner / super admin abuse | MFA + hardware keys recommended; only Owner manages super admins; no standing tenant content access on hosted; consented support sessions; two-person rule for delete/bulk upgrade |
| Privilege escalation via UI | **Server-side authz every request**; roles from DB; deny-by-default; per-role API tests in CI |
| Setup link hijack | One-time short-lived token; host-only regeneration; setup mode off permanently after Owner; health warning while active |
| Noisy tenant in shared all-in-one | OS user per process, ulimits/cgroups, rate limits; move heavy tenant to own container |
| Docker socket abuse | Socket proxy with minimal verbs or dedicated k8s RBAC |

Before **v1.0:** external security review (control plane, tenant isolation, updater), public disclosure policy, signed release pipeline.

---

## Authorization matrix

Platform roles and tenant roles are **separate scopes**. A person may hold different tenant roles in different tenants. “Opt.” = super admin with implicit tenant-admin install flag or explicit tenant assignment.

| Permission | Owner | Super admin | Tenant admin | Net admin | Auditor | Member | Guest |
|------------|:-----:|:-----------:|:------------:|:---------:|:-------:|:------:|:-----:|
| Super admins, ownership, platform settings | Yes | — | — | — | — | — | — |
| Create/suspend/delete tenants, quotas | Yes | Yes | — | — | — | — | — |
| Assign tenant admins | Yes | Yes | — | — | — | — | — |
| Fleet, relays, upgrades, platform audit | Yes | Yes | — | — | — | — | — |
| Manage users/groups below admin | Opt. | Opt. | Yes | — | — | — | — |
| Edit envs, rules, policy | Opt. | Opt. | Yes | Assigned envs | — | — | — |
| Approve access requests | Opt. | Opt. | Yes | Per env | — | — | — |
| Create share links | Opt. | Opt. | Yes | Yes | — | Own devices | — |
| View tenant audit / export | Opt. | Opt. | Yes | — | Yes | — | — |
| View all devices / analytics | Opt. | Opt. | Yes | Yes | Read | — | — |
| Own devices, request access | — | — | Yes | Yes | Yes | Yes | One device |

Rules:

- Approvers cannot approve their own requests
- Prod changes may require second approver (tenant policy)
- UI hiding is **not** security—API must return 403

Platform area (tenants, fleet, relays) requires step-up MFA. Tenant areas (policy, devices, audit) require a role in that tenant unless the install grants super admins implicit tenant access.

---

## Authentication

- **Humans:** OIDC (Auth0, Keycloak, Google Workspace, etc.); mandatory MFA for Owner/super admins; step-up MFA entering Platform area
- **Machines:** scoped API keys; OAuth2 client credentials pattern for automation
- **Setup:** no default password; recovery codes for Owner; host-level reset procedure documented for lockout
- **Sessions:** short-lived; refresh rotation; optional separate admin hostname

Future: SCIM provisioning (enterprise / post-1.0).

---

## Audit log

### What is recorded

- Every state-changing API call (actor, action, before/after, IP, UA, request id)
- Login, MFA, role changes, API key lifecycle
- Policy: create, test, apply, rollback
- Access requests, approvals, grant expiry/revoke, share link create/redeem/revoke
- Device lifecycle observed via Headscale: register, tag change, route approval, remove

### Integrity

- Append-only inserts; no UPDATE/DELETE on events (including Owner)
- Hash chain linking events per tenant
- Periodic publish of chain head externally
- Default retention 400 days; configurable longer for compliance

### Export

- Filtered CSV / JSONL download
- Scheduled export to S3-compatible storage
- Syslog, webhook, SIEM streaming (later phase)

Platform actions affecting a tenant duplicate into that tenant’s audit stream.

---

## Policy safety

- Generated negative/positive tests per group/environment
- Lint before apply
- Human-readable diff preview
- Debounced apply to avoid reload storms on grant expiry bursts
- Versioned snapshots for rollback

---

## Share links and guests

- Tokens stored hashed; single- or limited-use
- Scope: one device, explicit ports; no subnet routes, exit nodes, or broad DNS
- `tag:guest` ephemeral nodes; automatic cleanup
- Rate-limited public redemption endpoint

---

## Headscale and client security

- Pin Headscale version; CI against supported official client window (e.g. last ~10 client releases)
- Console surfaces client version per device; warn when unsupported
- Users responsible for client updates (MDM or manual)—document in Connect area

Do not ship a custom client—reduces attack surface for Otterscale but dependency on Tailscale client update practices remains.

---

## Licensing and supply chain (governance)

- Platform: AGPL-3.0 (anti closed hosted fork) or Apache-2.0 (max adoption)—decide before v1.0
- SDK, CLI, operator, Terraform: Apache-2.0
- DCO/CLA, CODE_OF_CONDUCT, SECURITY.md public

---

## Related documents

- [Architecture — roles and flows](./architecture.md#role-model-summary)
- [Deployment — hardening checklist](./deployment.md#security-hardening-checklist)
- [Open questions — verification before SLA claims](./open-questions.md)
