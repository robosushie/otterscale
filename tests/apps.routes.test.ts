import { describe, expect, it } from "vitest";
import { generateAppsRoutes } from "@/lib/apps/routes";
import { preferMeshIp } from "@/lib/machines/sync";

describe("generateAppsRoutes", () => {
  it("emits JSON routes for the tsnet proxy", () => {
    const file = generateAppsRoutes("apps.localhost", [
      { id: "abc", subdomain: "grafana", ip: "100.64.0.2", port: 3000 },
    ]);
    const parsed = JSON.parse(file) as {
      baseDomain: string;
      routes: { subdomain: string; ip: string; port: number }[];
    };
    expect(parsed.baseDomain).toBe("apps.localhost");
    expect(parsed.routes).toEqual([{ id: "abc", subdomain: "grafana", ip: "100.64.0.2", port: 3000 }]);
  });
});

describe("preferMeshIp", () => {
  it("prefers IPv4 over CGNAT IPv6", () => {
    expect(preferMeshIp(["fd7a:115c:a1e0::1", "100.64.0.3"])).toBe("100.64.0.3");
  });

  it("falls back to the first address when only IPv6 exists", () => {
    expect(preferMeshIp(["fd7a:115c:a1e0::1"])).toBe("fd7a:115c:a1e0::1");
  });
});
