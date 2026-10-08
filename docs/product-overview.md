# Otterscale product overview

**Otterscale** is an open-source control platform for team mesh networking: multi-tenant spaces, environments, groups, approval-based access, audit, and automation—built on **Headscale**, consumed with **official Tailscale clients** (no custom app).

Working name pending trademark/domain review. Do not use Tailscale name or logo in product UI; say **“compatible with Tailscale clients.”**

Spec: [Otterscale Design Architecture (PDF)](./external/Otterscale_Design_Architecture.pdf) v0.5.

---

## Problem

Teams want Tailscale-like simplicity **without per-seat SaaS lock-in**, but self-hosted Headscale alone means:

- CLI-heavy administration and hand-written HuJSON policy
- No multi-tenant console for MSPs or prod/uat/dev **spaces**
- No first-class access requests, expiring grants, guest links, or exportable audit
- No unified role model (Owner → super admins → tenant admins) across many tailnets

Community UIs (e.g. Headplane) cover admin CRUD. Otterscale targets **tenancy, workflows, audit, CLI/SDK, and Connect onboarding** for official clients.

---

## Solution (one sentence)

Keep Headscale as the coordination engine; build everything teams miss around it—a **single role-based console**, **intent-based policy compiler**, **access product**, and **deployment/orchestration**—while users run the **unmodified Tailscale apps**.

---

## Personas

| Persona | Needs |
|---------|--------|
| Founder / CTO | Zero per-seat cost, afternoon setup, prod locked down |
| DevOps / platform | Environments, Terraform, K8s, audit, no snowflake ACLs |
| Developer | SSO, see only allowed devices, request access when needed |
| Contractor / guest | Temporary access to one machine, nothing else visible |
| Security / compliance | Who accessed what, when, who approved; exports |
| MSP / agency | Many customer tailnets, strict separation, one operator console |

---

## Mental model: like a cloud account

| Cloud | Otterscale | Implementation |
|-------|------------|----------------|
| Organisation | **Tenant** | One Headscale instance + control records |
| VPC | **Environment** (prod, uat, dev) | Tags + rules; optional dedicated instance for strict prod |
| IAM group | **Group** | Policy groups; map from IdP |
| Security group rule | **Access rule** | Compiled ACL/grant lines |
| Resource tags | **Tags** | Headscale tag owners + scoped auth keys |
| STS temporary creds | **Access grant** | Time-boxed compiled rule + reaper |
| Pre-signed URL | **Share link** | Guest user + ephemeral key + narrow rule |

---

## In scope

- Control platform API and worker
- Single web console (Platform, Workspace, Network, Audit, Analytics, My access, **Connect**)
- Policy compiler (intent → HuJSON + tests)
- RBAC, append-only audit with hash chain
- Access requests, approvals, expiring grants, share links
- Analytics (inventory, adoption, workflow metrics)
- `otter` CLI/agent (wrapper around official client)
- SDKs, Terraform provider, Kubernetes operator
- Docker images, Compose, Helm, all-in-one mode, DERP packaging

## Out of scope (v1)

- Custom desktop/mobile VPN clients
- Reimplementing WireGuard or forking Headscale
- Tailscale proprietary control plane
- Packet-level flow logs by default (optional opt-in agent only)

---

## Competitive landscape (short)

| Project | Relation |
|---------|----------|
| Headscale | **Engine** — dependency, partner |
| Headplane / admin UIs | Overlap on CRUD; Otterscale adds tenancy + workflows |
| NetBird | Full stack, different protocol/clients |
| Tailscale SaaS | Reference UX; Otterscale = self-hosted, open team layer |

**Verdict (from spec):** Good open-source product **if** scope stays disciplined: console + policy + audit + CLI first; **official clients only**; tenancy and access workflows as headline features; compatibility CI from day one; security review before 1.0.

---

## Console & clients

- **One web console** — navigation follows API capability grants (Platform, Workspace, Network, Audit, My access, Connect). Authorization is always server-side; hidden menus are not security.
- **Design:** [theme.md](./theme.md) (parchment canvas, wine primary CTAs, violet links only).
- **Clients:** unmodified **official Tailscale apps** on laptops and phones; servers use `tailscaled` plus optional `otter` helper. No custom VPN app. **Connect** in the console supplies install links and per-tenant login URLs; several tenants use the app’s account switcher (one active tailnet at a time). Access requests and approvals live in the console, not in the Tailscale UI.

---

## Delivery

Six-phase roadmap: [roadmap.md](./roadmap.md).

---

## Related documents

- [Architecture](./architecture.md)
- [Deployment](./deployment.md)
- [Security](./security.md)
