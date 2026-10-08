# Open questions & verification checklist

Items marked **[verify]** in the [design specification](./external/Otterscale_Design_Architecture.pdf) must be resolved with spikes or integration tests before marketing promises or SLA claims.

Track status: `open` | `in progress` | `done` (update as spikes complete).

---

## Network & policy behavior

| Question | How to resolve | Affects | Status |
|----------|----------------|---------|--------|
| Do peers hidden by policy disappear from Headscale netmap? | 3-node integration test with group rules | Group visibility (spec §6) | open |
| Are established TCP/SSH sessions cut when ACL lines removed? | Test across policy reload | Time-limited access guarantees (§10) | open |
| Which v2 API operations exist for policy apply and nodes? | Read Headscale API docs; script against test instance | Compiler adapter, SDK reuse | open |
| Headscale node sharing between tailnets | Docs + issues | Guest/share design (§11) | open |
| Headscale events vs polling only | Check release; consider upstream contribution | Real-time UI, device audit | open |
| SSH check actions for periodic re-auth | Test with pinned Headscale | Long-lived SSH sessions | open |

---

## Official Tailscale clients (no custom app)

| Question | How to resolve | Affects | Status |
|----------|----------------|---------|--------|
| Reliable multi-account switching on Windows, macOS, Linux, Android, iOS | Manual QA matrix each client release | Connect area (§15) | open |
| Exact steps to set custom control URL per OS/version | Document + re-check each release | Connect, MDM | open |
| MDM preconfiguration of control URL | Test Intune/Jamf profiles | Enterprise onboarding | open |
| Tailscale policy on third-party control servers long-term | Legal/product review | Risk register | open |

---

## Deployment & capacity

| Question | How to resolve | Affects | Status |
|----------|----------------|---------|--------|
| Render/similar: persistent volumes + internal ports for all-in-one | Trial deploy | PaaS guidance | open |
| UDP support on alternative PaaS | Provider docs | DERP placement | open |
| Tenants per all-in-one host (CPU/RAM idle vs active) | Benchmark synthetic tenants | Capacity docs | open |
| Headscale HA options | Docs + load test restart | Hosted SLA | open |
| Behavior when tenant **suspended** (existing connections) | Integration test | Lifecycle UX | open |
| Control server restart: new logins vs existing tunnels | Load test | Operations runbooks | open |

---

## Platform & trust

| Question | How to resolve | Affects | Status |
|----------|----------------|---------|--------|
| Limit super admin policy power for hosted tenants | Design review; tenant approval keys? | Trust model (§7) | open |
| Tailscale K8s operator vs Headscale on your versions | Spike cluster | Operator scope (§13) | open |

---

## Branding & naming

| Question | How to resolve | Affects | Status |
|----------|----------------|---------|--------|
| Otterscale / `otter` naming collisions (npm, PyPI, Docker, trademarks) | Registry + trademark search | Launch | open |

---

## Recommended spike order (Phase 1)

1. Headscale v2 API coverage for policy CRUD and validation command
2. Netmap visibility with 3 users / 3 tags
3. Reverse proxy + WebSocket + official Linux client login
4. Policy reload effect on active TCP connection
5. PaaS volume trial for all-in-one (if targeting Railway/Render)

Results should update [architecture.md](./architecture.md), [deployment.md](./deployment.md), and [product-overview.md](./product-overview.md) where user-facing behavior is affected.

---

## Sources (from spec Appendix C)

- Headscale v0.29.x releases, grants, policy tests, min client v1.80.0
- Headscale FAQ: SQLite, scaling, containers, reverse proxies
- Headplane and community UIs
- Tailscale docs: policy, K8s operator
- Railway: no inbound UDP

Full list in PDF Appendix C.
