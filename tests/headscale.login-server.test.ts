import { describe, expect, it } from "vitest";
import { getLoginServerUrl, tailscaleUpCommand } from "@/lib/headscale/login-server";

describe("login-server", () => {
  it("falls back to loopback HTTP when OTTERSCALE_DOMAIN is empty", () => {
    expect(getLoginServerUrl(undefined)).toBe("http://127.0.0.1:8080");
    expect(getLoginServerUrl("")).toBe("http://127.0.0.1:8080");
    expect(getLoginServerUrl("   ")).toBe("http://127.0.0.1:8080");
  });

  it("uses OTTERSCALE_DOMAIN as an HTTPS origin", () => {
    expect(getLoginServerUrl("https://hs.example.com/path")).toBe("https://hs.example.com");
    expect(getLoginServerUrl("hs.example.com")).toBe("https://hs.example.com");
    expect(getLoginServerUrl("hs.example.com/")).toBe("https://hs.example.com");
    expect(getLoginServerUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });

  it("prints logout then tailscale up", () => {
    expect(tailscaleUpCommand("tskey-auth-test", "http://127.0.0.1:8080")).toBe(
      "tailscale logout\ntailscale up --login-server=http://127.0.0.1:8080 --auth-key=tskey-auth-test",
    );
    expect(tailscaleUpCommand("tskey-auth-test", "https://hs.example.com")).toBe(
      "tailscale logout\ntailscale up --login-server=https://hs.example.com --auth-key=tskey-auth-test",
    );
  });
});
