import type { Capability, PlatformRole, TenantRole } from "@/types/roles";

type AuthzContext = {
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
  superAdminsImplicitTenantAdmin: boolean;
};

const ADMIN_CAPS: Capability[] = [
  "workspace.manage",
  "workspace.policy",
  "network.manage",
  "network.view",
  "audit.view",
  "audit.export",
  "members.view",
  "members.invite",
];

const MEMBER_CAPS: Capability[] = ["network.view", "members.view", "audit.view"];

export function resolveCapabilities(ctx: AuthzContext): Capability[] {
  const caps = new Set<Capability>();

  if (ctx.platformRoles.includes("OWNER")) {
    caps.add("platform.view");
    caps.add("platform.manage_admins");
    caps.add("platform.settings");
  } else if (ctx.platformRoles.includes("SUPER_ADMIN")) {
    caps.add("platform.view");
  }

  const effectiveTenantRole =
    ctx.tenantRole ??
    (ctx.superAdminsImplicitTenantAdmin &&
    (ctx.platformRoles.includes("OWNER") || ctx.platformRoles.includes("SUPER_ADMIN"))
      ? "ADMIN"
      : null);

  if (effectiveTenantRole === "ADMIN") {
    ADMIN_CAPS.forEach((c) => caps.add(c));
  } else if (effectiveTenantRole === "MEMBER") {
    MEMBER_CAPS.forEach((c) => caps.add(c));
  }

  if (ctx.platformRoles.includes("OWNER") || ctx.platformRoles.includes("SUPER_ADMIN")) {
    if (ctx.superAdminsImplicitTenantAdmin) {
      ADMIN_CAPS.forEach((c) => caps.add(c));
    }
  }

  return [...caps];
}

export function hasCapability(capabilities: Capability[], required: Capability): boolean {
  return capabilities.includes(required);
}
