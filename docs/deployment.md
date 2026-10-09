# Otterscale deployment guide

How to run Otterscale in production and homelab: images, topology, orchestrator modes, backups, and platform constraints (especially **UDP for relays**).

Source: [design specification](./external/Otterscale_Design_Architecture.pdf) §16; see also [architecture](./architecture.md).

---

## Deployment targets (summary)

| Target | Control platform | Per-tenant Headscale | DERP / STUN | Verdict |
|--------|------------------|----------------------|-------------|---------|
| Single VM + Docker Compose | Yes | Yes (docker socket or all-in-one) | Same or second VM | **Best start** |
| AWS ECS/EC2 + RDS | Yes | ECS tasks or EC2 | EC2 + UDP SG | Production SaaS |
| Kubernetes + Helm | Yes | StatefulSet per tenant | DaemonSet or external VM | Multi-tenant scale |
| Railway / TCP-only PaaS | Yes (HTTP) | All-in-one + volume [verify] | **No** inbound UDP | Control + tenants possible; relays elsewhere |
| Render / similar | Likely HTTP + all-in-one [verify volumes] | Check UDP | Treat like Railway until verified |

**Rule:** PaaS can host the **HTTP control plane** and, with the all-in-one image, **many tenant Headscale processes inside one service**, but **DERP/STUN requires a VM** (or provider that allows inbound UDP). Early setups may use public relay infrastructure temporarily—plan own relays for production.

---

## Container images

| Image | Contents | Notes |
|-------|----------|-------|
| `otterscale-platform` | API, worker, orchestrator subcommands; embedded console assets | Stateless; horizontal scale; needs Postgres |
| `otterscale-headscale` | Pinned Headscale + Litestream + health probe + config render entrypoint | One container **per tenant** (docker/k8s driver) |
| `otterscale-allinone` | Platform + reverse proxy + supervisor + N Headscale **processes** | Single container, N tenants; one persistent volume |
| `otterscale-derp` | DERP + STUN | UDP **3478** + TLS |
| `otterscale-operator` | Kubernetes operator + CRDs | Phase 5 |
| `otter` | CLI/agent binaries | Install script; not a long-running server |

Pin Headscale version in image tags; carry multiple binaries in all-in-one for stepwise tenant upgrades.

---

## Reference topology

```mermaid
flowchart LR
  subgraph internet [Internet]
    U[Users and devices]
  end

  subgraph vm1 [VM or cluster edge]
    Caddy[Caddy or nginx TLS WS]
    Plat[otterscale-platform]
    PG[(PostgreSQL)]
  end

  subgraph vm2 [VM UDP]
    DERP[otterscale-derp]
  end

  subgraph tenants [Tenant runtime]
    AIO[all-in-one OR per-tenant containers]
  end

  U --> Caddy
  Caddy --> Plat
  Caddy --> AIO
  Plat --> PG
  Plat --> AIO
  U --> DERP
  AIO --> DERP
```

- **Edge:** Wildcard TLS, WebSocket upgrade (Headscale client protocol)—test reference config; proxy misconfiguration is the top support issue.
- **Platform:** `DATABASE_URL`, `PUBLIC_BASE_DOMAIN`, `ORCHESTRATOR`, relay map URL, KMS for tenant Headscale API keys.
- **Tenants:** Never share one Headscale process across tenants—**one process (or container) per tailnet**.

---

## Orchestrator drivers

| Driver | Env example | Behavior |
|--------|-------------|----------|
| `process` | `ORCHESTRATOR=process` | Supervisor spawns child Headscale; shared container kernel |
| `docker` | `ORCHESTRATOR=docker` | One container per tenant; mount `/var/run/docker.sock` via **socket proxy** in prod |
| `kubernetes` | `ORCHESTRATOR=kubernetes` | StatefulSet per tenant; platform SA with namespace-scoped RBAC |

### All-in-one (process driver)

- **Not** one Headscale for many tailnets—**N processes**, each with own SQLite, listen ports, metrics port, IP prefix
- Embedded DERP **disabled** per child; all use `RELAY_MAP_URL`
- Add tenant: allocate dir + ports + prefix → render config → start process → add proxy route
- Child runs as separate OS user; cgroups/ulimits per tenant
- **Limits:** shared fate on container restart; benchmark tenants/host before publishing capacity numbers

Illustrative env:

```bash
ORCHESTRATOR=process
TENANT_PORT_RANGE=18000-18999
DATA_DIR=/data
HEADSCALE_BIN_DIR=/opt/headscale
RELAY_MAP_URL=https://derp.example.com/map.json
PUBLIC_BASE_DOMAIN=otter.example.com
```

---

## Quickstart: Docker Compose (sketch)

Production hardening required (secrets, socket proxy, TLS). Illustrative services:

```yaml
services:
  postgres:
    image: postgres:17
    volumes: [pg:/var/lib/postgresql/data]
    environment:
      POSTGRES_USER: otterscale
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: otterscale

  platform:
    image: ghcr.io/example/otterscale-platform:0.1.0
    environment:
      DATABASE_URL: postgres://otterscale:change-me@postgres/otterscale
      PUBLIC_BASE_DOMAIN: otter.example.com
      ORCHESTRATOR: docker   # or process inside all-in-one image
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # restrict in production
    depends_on: [postgres]

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data

  derp:
    image: ghcr.io/example/otterscale-derp:0.1.0
    ports:
      - "3478:3478/udp"
      - "8443:8443"

volumes:
  pg: {}
  caddy_data: {}
```

**Homelab shortcut:** single `otterscale-allinone` service + external Postgres optional (embedded SQLite for platform only—not recommended for multi-user prod).

---

## Per-tenant Headscale container (docker driver)

- Persistent volume per tenant for SQLite
- Litestream → S3-compatible object storage
- Private network: platform talks to Headscale admin API on internal DNS, not public internet
- Envelope-encrypted Headscale API key in platform DB (KMS)

---

## Kubernetes (Phase 5)

- **Helm release:** platform Deployment, worker Deployment, Ingress (gRPC/WebSocket aware), external Postgres
- **Tenant chart/module:** StatefulSet + PVC + Service per tenant; operator or platform creates releases
- **DERP:** DaemonSet with `hostPort` or dedicated nodes + UDP LB—or external VM relays
- **Operator:** separate chart; CRDs installed cluster-wide or per team namespace

---

## Environment variables (platform)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `PUBLIC_BASE_DOMAIN` | Tenant hostnames `*.otter.example.com` |
| `ORCHESTRATOR` | `process` \| `docker` \| `kubernetes` |
| `RELAY_MAP_URL` | DERP map for all tenants |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, … | Human auth |
| `SETUP_TOKEN` | Optional one-time first Owner bootstrap |
| `KMS_*` / `ENCRYPTION_KEY` | Tenant Headscale API key encryption |
| `SMTP_*` or webhook URLs | Notifications |

Tenant-specific config is rendered into Headscale YAML/JSON at provision time (listen addresses, prefixes, OIDC, DNS, relay map).

---

## Reverse proxy requirements

- TLS termination with valid certs (wildcard recommended)
- **WebSocket** support on paths used by Headscale coordination
- Timeouts suitable for long-lived connections
- Do not buffer SSE from platform API on audit/event streams
- Document tested configs: **Caddy** (recommended in spec sketch), nginx, Traefik
- **Network Apps:** one `edge` container (Caddy TLS + Go `tsnet`) joins local Headscale as hostname `edge` / `tag:edge`, reverse-proxies published apps, and answers TCP probes on port 4180. Public Caddy in that container terminates TLS for `console.localhost`, `hs.localhost`, and `*.apps.localhost`. `headscale/headscale` is the coordination server, not a mesh peer. Production uses wildcard DNS and certs on `APPS_BASE_DOMAIN`. Local clients join Headscale at `http://127.0.0.1:8080`. Set `OTTERSCALE_DOMAIN` so **Add device** prints that HTTPS login-server. This is not Funnel.

Headscale upstream docs discourage containers/reverse proxies without careful testing—run Otterscale’s integration tests against your chosen proxy.

---

## Upgrades

1. **Platform:** rolling deploy of stateless API/worker; migrate Postgres schema
2. **Headscale per tenant:** respect **no skipping minor versions**; upgrade canary tenant first
3. Keep previous container image and SQLite snapshot for rollback
4. Console shows per-tenant version and upgrade status (Platform area)

---

## Backups and DR

| Asset | Method | RPO / RTO guidance |
|-------|--------|---------------------|
| Postgres | Nightly dump + WAL archiving | Platform config and audit |
| Tenant SQLite | Litestream continuous | Per-tenant RPO minutes |
| Policy snapshots | In Postgres JSONB | Logical rollback without DB restore |
| Object storage | Versioned bucket for Litestream | Test restore **monthly** |

Headscale is a single process per tenant [verify HA options]—mitigate with fast restart, health checks, and clear SLA: existing device tunnels often survive brief control outage; new logins and policy applies may pause [verify].

---

## Observability

- Structured logs: `tenant_id`, `request_id`, `user_id`
- Prometheus: API latency, policy reload duration, queue depth, Headscale scrape (community exporters)
- Alerts: setup mode still on, Headscale down, Litestream lag, disk full on tenant volumes
- Health endpoint: includes **setup mode warning** for monitoring

---

## Security hardening checklist

- [ ] Docker socket proxy (allow only create/start/stop for tenant containers)
- [ ] Network policies: Headscale API reachable only from platform subnet
- [ ] Separate hostname or IP allow-list for Platform admin UI
- [ ] Secrets in vault/KMS, not env files in git
- [ ] Rate limiting at edge; per-tenant quotas

See [security.md](./security.md).

---

## Otterscale Stack (Compose pull)

Canonical file: [`deploy/otterscale-stack.yaml`](../deploy/otterscale-stack.yaml). It pulls `ghcr.io/robosushie/otterscale/{app,edge,headscale}` and runs a one-shot **bootstrap** after Headscale is healthy (API key, `tag:edge` pre-auth key, `AUTH_SECRET` if unset).

```bash
cp deploy/otterscale-stack.env.example .env
docker compose -f deploy/otterscale-stack.yaml --env-file .env up -d
```

Set `OTTERSCALE_DOMAIN` (and `AUTH_URL`) whenever TLS sits in front of Headscale. Local default login-server remains `http://127.0.0.1:8080`. Platform notes (AWS, Azure, GCP, Akamai, Render, Railway, Heroku) and the downloadable YAML live on the [GitHub Pages deploy page](https://robosushie.github.io/otterscale/deploy.html). Railway and Heroku cannot execute this Compose file as a single service.

Publish images with **Actions → Publish GHCR** (select branch, input tag). Local `pnpm deploy:stack` still builds from source via [`deploy/docker-compose.yml`](../deploy/docker-compose.yml).

---

## PaaS-specific notes

### Railway

- TCP proxy; **no inbound UDP** → DERP on external VM
- Do not run [`otterscale-stack.yaml`](../deploy/otterscale-stack.yaml) as one Railway service (no shared volumes). Map the three GHCR images; mint keys by hand.
- All-in-one may run multiple tenant processes if **persistent volume** and port range available [verify on trial deploy]

### AWS

- RDS Postgres; ECS/Fargate for platform; EC2 or ECS on EC2 for tenants needing predictable networking
- Security group: UDP 3478 for DERP instances

### Single-org homelab

- One VM, Compose, `ORCHESTRATOR=process` all-in-one, optional Tailscale subnet router elsewhere for admin access

---

## Related documents

- [Architecture](./architecture.md)
- [Roadmap — Phase 2 all-in-one](./roadmap.md#phase-2--multi-tenancy--platform-console)
- [Open questions — PaaS volumes and capacity](./open-questions.md)
