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

  it("grants members.invite to tenant admin", () => {
    const caps = resolveCapabilities({
      platformRoles: [],
      tenantRole: "TENANT_ADMIN",
      superAdminsImplicitTenantAdmin: false,
    });
    expect(caps).toContain("members.invite");
  });

  it("grants auditor read-only audit and network view", () => {
    const caps = resolveCapabilities({
      platformRoles: [],
      tenantRole: "AUDITOR",
      superAdminsImplicitTenantAdmin: false,
    });
    expect(caps).toContain("audit.view");
    expect(caps).not.toContain("workspace.policy");
  });
});
