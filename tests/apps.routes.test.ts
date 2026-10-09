import { describe, expect, it } from "vitest";
import { generateAppsRoutes } from "@/lib/apps/routes";

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
