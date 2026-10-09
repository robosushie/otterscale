import { describe, it, expect } from "vitest";
import { resolveCapabilities } from "@/lib/authz/permissions";

describe("resolveCapabilities", () => {
  it("grants platform.manage_admins only to owner", () => {
    const owner = resolveCapabilities({
      platformRoles: ["OWNER"],
      tenantRole: null,
      superAdminsImplicitTenantAdmin: true,
    });
    expect(owner).toContain("platform.manage_admins");

    const sa = resolveCapabilities({
      platformRoles: ["SUPER_ADMIN"],
      tenantRole: null,
      superAdminsImplicitTenantAdmin: true,
    });
    expect(sa).not.toContain("platform.manage_admins");
    expect(sa).toContain("workspace.manage");
  });

  it("grants members.invite to workspace admin", () => {
    const caps = resolveCapabilities({
      platformRoles: [],
      tenantRole: "ADMIN",
      superAdminsImplicitTenantAdmin: false,
    });
    expect(caps).toContain("members.invite");
  });

  it("grants members view but not policy to member", () => {
    const caps = resolveCapabilities({
      platformRoles: [],
      tenantRole: "MEMBER",
      superAdminsImplicitTenantAdmin: false,
    });
    expect(caps).toContain("network.view");
    expect(caps).not.toContain("workspace.policy");
  });
});
