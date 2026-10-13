import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("local stack compose", () => {
  const compose = readFileSync(resolve(process.cwd(), "deployment/docker-compose.yml"), "utf8");
  const bootstrap = readFileSync(resolve(process.cwd(), "deployment/headscale/bootstrap.sh"), "utf8");
  const script = readFileSync(resolve(process.cwd(), "scripts/deploy-stack.mjs"), "utf8");
  const workflow = readFileSync(
    resolve(process.cwd(), ".github/workflows/publish-ghcr.yml"),
    "utf8",
  );

  it("runs init onto a secrets volume and blanks host Headscale keys", () => {
    expect(compose).toContain("\n  init:");
    expect(compose).toContain("container_name: otterscale-init");
    expect(compose).toContain("http://127.0.0.1:8080/health");
    expect(compose).not.toContain("http://127.0.0.1:8080/key");
    expect(compose).toContain("otterscale_secrets:/otterscale-secrets");
    expect(compose).toContain('HEADSCALE_API_KEY: ""');
    expect(compose).toContain('APPS_EDGE_AUTHKEY: ""');
    expect(compose).not.toContain("APPS_EDGE_AUTHKEY: ${");
    expect(compose).toContain("entrypoint: [\"/bootstrap.sh\"]");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("condition: service_completed_successfully");
  });

  it("runs core and the static console as separate services", () => {
    expect(compose).toContain("\n  core:");
    expect(compose).toContain("\n  app:");
    expect(compose).toContain("deployment/core/Dockerfile");
    const coreImage = readFileSync(resolve(process.cwd(), "deployment/core/Dockerfile"), "utf8");
    const coreEntrypoint = readFileSync(resolve(process.cwd(), "deployment/core/entrypoint.sh"), "utf8");
    expect(coreImage).toContain("COPY deployment/core/entrypoint.sh /entrypoint.sh");
    expect(coreImage).toContain('ENTRYPOINT ["/entrypoint.sh"]');
    expect(coreEntrypoint).toContain("load_secret HEADSCALE_API_KEY");
    expect(compose).toContain("deployment/app/Dockerfile");
    expect(compose).toContain("DATABASE_URL: ${DATABASE_URL:-}");
    expect(compose).not.toContain("postgres:");
  });

  it("normalizes shell entrypoints for every host OS", () => {
    const dockerfile = readFileSync(resolve(process.cwd(), "deployment/edge/Dockerfile"), "utf8");
    const attributes = readFileSync(resolve(process.cwd(), ".gitattributes"), "utf8");
    expect(dockerfile).toContain("sed -i 's/\\r$//' /entrypoint.sh");
    expect(attributes).toContain("*.sh text eol=lf");
    for (const rel of [
      "deployment/core/entrypoint.sh",
      "deployment/edge/entrypoint.sh",
      "deployment/headscale/entrypoint.sh",
      "deployment/headscale/bootstrap.sh",
      "deployment/standalone/entrypoint.sh",
    ]) {
      expect(readFileSync(resolve(process.cwd(), rel), "utf8"), rel).not.toContain("\r");
    }
  });

  it("keeps the dot in a Headscale API key", () => {
    expect(bootstrap).toContain('if type == "string" then .');
    expect(bootstrap).not.toContain("grep -Eo '[A-Za-z0-9_-]{16,}'");
  });

  it("wipes volumes by default and can keep them", () => {
    expect(script).toContain('"down", "-v"');
    expect(script).toContain("--keep-data");
  });

  it("still publishes the split images", () => {
    expect(workflow).toContain("name: app");
    expect(workflow).toContain("name: core");
    expect(workflow).toContain("name: edge");
    expect(workflow).toContain("name: headscale");
    expect(workflow).toContain("visibility=public");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).toContain("site/releases.json");
  });

  it("pulls GHCR images by OTTERSCALE_IMAGE_TAG without building", () => {
    const pull = readFileSync(resolve(process.cwd(), "deployment/otterscale-stack.yaml"), "utf8");
    expect(pull).not.toContain("\n    build:");
    expect(pull).not.toContain("./Caddyfile");
    expect(pull).not.toContain("./headscale/config.yaml");
    expect(pull).toContain("/headscale:${OTTERSCALE_IMAGE_TAG:-latest}");
    expect(pull).toContain("/core:${OTTERSCALE_IMAGE_TAG:-latest}");
    expect(pull).toContain("/app:${OTTERSCALE_IMAGE_TAG:-latest}");
    expect(pull).toContain("/edge:${OTTERSCALE_IMAGE_TAG:-latest}");
    expect(pull).toContain('HEADSCALE_API_KEY: ""');
    expect(pull).toContain('APPS_EDGE_AUTHKEY: ""');
    expect(pull).toContain("http://headscale:8080");
    expect(pull).toContain('entrypoint: ["/bootstrap.sh"]');
    expect(compose).toContain("\n    build:");
    expect(compose).not.toContain("OTTERSCALE_IMAGE_TAG");
  });
});
