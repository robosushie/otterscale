import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("local stack compose", () => {
  const compose = readFileSync(resolve(process.cwd(), "deploy/docker-compose.yml"), "utf8");
  const bootstrap = readFileSync(resolve(process.cwd(), "deploy/headscale/bootstrap.sh"), "utf8");
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

  it("normalizes the app entrypoint for every host OS", () => {
    const dockerfile = readFileSync(resolve(process.cwd(), "deploy/Dockerfile"), "utf8");
    const attributes = readFileSync(resolve(process.cwd(), ".gitattributes"), "utf8");
    expect(dockerfile).toContain("sed -i 's/\\r$//' /docker-entrypoint.sh");
    expect(attributes).toContain("*.sh text eol=lf");
    for (const rel of [
      "deploy/docker-entrypoint.sh",
      "deploy/edge/entrypoint.sh",
      "deploy/headscale/entrypoint.sh",
      "deploy/headscale/bootstrap.sh",
      "deploy/standalone/entrypoint.sh",
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
    expect(workflow).toContain("name: edge");
    expect(workflow).toContain("name: headscale");
  });
});
