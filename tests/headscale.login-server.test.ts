import { describe, expect, it } from "vitest";
import { getLoginServerUrl, tailscaleUpCommand } from "@/lib/headscale/login-server";

describe("login-server", () => {
  it("derives host:8080 from AUTH_URL", () => {
    expect(getLoginServerUrl("http://localhost:3000", "")).toBe("http://localhost:8080");
    expect(getLoginServerUrl("https://console.example.com", "")).toBe("https://console.example.com:8080");
  });

  it("prefers HEADSCALE_PUBLIC_URL when set", () => {
    expect(getLoginServerUrl("https://console.localhost", "https://hs.localhost")).toBe(
      "https://hs.localhost",
    );
  });

  it("prints a concrete tailscale up command", () => {
    expect(tailscaleUpCommand("tskey-auth-test", "http://localhost:8080")).toBe(
      "tailscale up --login-server=http://localhost:8080 --auth-key=tskey-auth-test",
    );
  });
});
