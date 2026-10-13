import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("Otterscale standalone", () => {
  const dockerfile = readFileSync(
    resolve(process.cwd(), "deployment/standalone/Dockerfile"),
    "utf8",
  );
  const compose = readFileSync(
    resolve(process.cwd(), "deployment/docker-compose.standalone.yml"),
    "utf8",
  );
  const pull = readFileSync(resolve(process.cwd(), "deployment/otterscale-standalone.yaml"), "utf8");
  const caddy = readFileSync(resolve(process.cwd(), "deployment/standalone/Caddyfile"), "utf8");
  const paas = readFileSync(resolve(process.cwd(), "deployment/standalone/Caddyfile.paas"), "utf8");
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/publish-ghcr.yml"),
    "utf8",
  );
  const pkg = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
  const script = readFileSync(resolve(process.cwd(), "scripts/deploy-standalone.mjs"), "utf8");
  const entrypoint = readFileSync(
    resolve(process.cwd(), "deployment/standalone/entrypoint.sh"),
    "utf8",
  );
  const appCaddy = readFileSync(resolve(process.cwd(), "deployment/app/Caddyfile"), "utf8");

  it("builds a single image with Caddy, Headscale, core, and the console", () => {
    expect(dockerfile).toContain("VOLUME [\"/data\"]");
    expect(dockerfile).toContain("COPY --from=headscale /ko-app/headscale");
    expect(dockerfile).toContain("COPY --from=caddy /usr/bin/caddy");
    expect(dockerfile).toContain("COPY --from=proxy /out/proxy");
    expect(dockerfile).toContain("COPY --from=core /out/core");
    expect(dockerfile).toContain("COPY --from=app /src/packages/app/dist /srv\n");
    expect(dockerfile).not.toContain("/srv/app");
    expect(appCaddy).toContain("root * /srv");
    expect(appCaddy).toContain("try_files {path} /index.html");
    expect(entrypoint).toContain("/usr/local/bin/core");
  });

  it("proxies the API to core and the console to loopback", () => {
    expect(caddy).toContain("reverse_proxy 127.0.0.1:4000");
    expect(caddy).toMatch(/reverse_proxy 127.0.0.1:4000 \{[\s\S]*flush_interval -1[\s\S]*read_timeout 1h/);
    expect(paas).toMatch(/reverse_proxy 127.0.0.1:4000 \{[\s\S]*flush_interval -1/);
    expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
    expect(compose).toContain("DATABASE_URL: ${DATABASE_URL:-}");
    expect(compose).not.toContain("postgres:");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:18080");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:8081");
    expect(caddy).not.toContain("reverse_proxy app:3000");
    expect(caddy).not.toContain("reverse_proxy headscale:8080");
    expect(paas).toContain(":{$CADDY_PORT}");
    expect(paas).toContain("reverse_proxy 127.0.0.1:18080");
  });

  it("overrides Headscale to loopback and does not take host Headscale keys", () => {
    expect(compose).toContain("HEADSCALE_INTERNAL_URL: http://127.0.0.1:18080");
    expect(compose).toContain("otterscale_standalone_data:/data");
    expect(compose).toContain("127.0.0.1:8080:18080");
    expect(entrypoint).toContain("listen_addr: 0.0.0.0:18080");
    expect(entrypoint).not.toContain("listen_addr: 127.0.0.1:18080");
    expect(compose).toContain('APPS_EDGE_AUTHKEY: ""');
    expect(compose).not.toContain("APPS_EDGE_AUTHKEY: ${");
    expect(pull).toContain("ghcr.io/robosushie/otterscale}/standalone:${OTTERSCALE_IMAGE_TAG:-latest}");
    expect(pull).toContain("DATABASE_URL: ${DATABASE_URL:-file:/data/otterscale.db}");
    expect(compose).not.toContain("OTTERSCALE_IMAGE_TAG");
    expect(pull).toContain("HEADSCALE_INTERNAL_URL: http://127.0.0.1:18080");
    expect(pull).not.toContain("HEADSCALE_API_KEY:");
    expect(pull).not.toContain("APPS_EDGE_AUTHKEY:");
  });

  it("publishes standalone on GHCR and exposes deploy:standalone", () => {
    expect(workflow).toContain("name: standalone");
    expect(workflow).toContain("file: deployment/standalone/Dockerfile");
    expect(pkg).toContain("\"deploy:standalone\"");
    expect(script).toContain('"down", "-v"');
    expect(script).toContain("--keep-data");
  });
});
