import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("deploy Caddyfile", () => {
  const file = readFileSync(resolve(process.cwd(), "deployment/Caddyfile"), "utf8");

  it("flushes the console API stream so live updates are not buffered", () => {
    expect(file).toContain("handle /api/*");
    expect(file).toMatch(/reverse_proxy core:4000 \{[\s\S]*flush_interval -1[\s\S]*read_timeout 1h/);
    expect(file).toContain("reverse_proxy app:3000");
  });

  it("proxies Headscale with long-poll settings", () => {
    expect(file).toContain("hs.localhost");
    expect(file).toContain("reverse_proxy headscale:8080");
    expect(file).toContain("flush_interval -1");
    expect(file).toContain("header_up True-Client-IP {remote_host}");
  });

  it("sends published apps to the local tsnet hop", () => {
    expect(file).toContain("*.{$APPS_BASE_DOMAIN:apps.localhost}");
    expect(file).toContain("reverse_proxy 127.0.0.1:8081");
  });
});
