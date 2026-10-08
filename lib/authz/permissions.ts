import type { Capability, PlatformRole, TenantRole } from "@/types/roles";

type AuthzContext = {
  platformRoles: PlatformRole[];
  tenantRole: TenantRole | null;
  superAdminsImplicitTenantAdmin: boolean;
};

const TENANT_ADMIN_CAPS: Capability[] = [
  "workspace.manage",
  "workspace.policy",
  "network.manage",
  "network.view",
  "audit.view",
  "audit.export",
  "members.view",
  "members.invite",
];

const NET_ADMIN_CAPS: Capability[] = [
  "workspace.policy",
  "network.manage",
  "network.view",
  "members.view",
];

const AUDITOR_CAPS: Capability[] = ["audit.view", "audit.export", "network.view"];

const MEMBER_CAPS: Capability[] = ["network.view", "members.view"];

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
      ? "TENANT_ADMIN"
      : null);

  if (effectiveTenantRole === "TENANT_ADMIN") {
    TENANT_ADMIN_CAPS.forEach((c) => caps.add(c));
  } else if (effectiveTenantRole === "NET_ADMIN") {
    NET_ADMIN_CAPS.forEach((c) => caps.add(c));
  } else if (effectiveTenantRole === "AUDITOR") {
    AUDITOR_CAPS.forEach((c) => caps.add(c));
  } else if (effectiveTenantRole === "MEMBER") {
    MEMBER_CAPS.forEach((c) => caps.add(c));
  }

  if (ctx.platformRoles.includes("OWNER") || ctx.platformRoles.includes("SUPER_ADMIN")) {
    if (ctx.superAdminsImplicitTenantAdmin) {
      TENANT_ADMIN_CAPS.forEach((c) => caps.add(c));
    }
  }

  return [...caps];
}

export function hasCapability(
  capabilities: Capability[],
  required: Capability,
): boolean {
  return capabilities.includes(required);
}
