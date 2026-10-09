import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("Otterscale Stack compose", () => {
  const file = readFileSync(resolve(process.cwd(), "deploy/otterscale-stack.yaml"), "utf8");

  it("pulls GHCR app, edge, and headscale images", () => {
    expect(file).toContain("ghcr.io/robosushie/otterscale}/headscale:");
    expect(file).toContain("ghcr.io/robosushie/otterscale}/app:");
    expect(file).toContain("ghcr.io/robosushie/otterscale}/edge:");
  });

  it("bootstraps secrets after Headscale is healthy", () => {
    expect(file).toContain("bootstrap:");
    expect(file).toContain("entrypoint: [\"/bootstrap.sh\"]");
    expect(file).toContain("condition: service_healthy");
    expect(file).toContain("condition: service_completed_successfully");
    expect(file).toContain("otterscale_secrets:/otterscale-secrets");
  });
});
