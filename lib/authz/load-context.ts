import { prisma } from "@/lib/db";
import { resolveCapabilities } from "@/lib/authz/permissions";
import type { UserCapabilities } from "@/types/roles";
export async function loadUserCapabilities(
  userId: string,
): Promise<UserCapabilities | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformMemberships: true,
      tenantMemberships: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  if (!user) return null;

  const org = await prisma.organization.findFirst({
    include: { settings: true },
  });
  const implicit = org?.settings?.superAdminsImplicitTenantAdmin ?? true;

  const platformRoles = user.platformMemberships.map((m) => m.role as "OWNER" | "SUPER_ADMIN");
  const tenantMembership = user.tenantMemberships[0];
  const tenantRole = tenantMembership?.role ?? null;

  const capabilities = resolveCapabilities({
    platformRoles,
    tenantRole: tenantRole as UserCapabilities["tenantRole"],
    superAdminsImplicitTenantAdmin: implicit,
  });

  return {
    userId: user.id,
    email: user.email,
    platformRoles,
    tenantRole: tenantRole as UserCapabilities["tenantRole"],
    capabilities,
    isOwner: platformRoles.includes("OWNER"),
  };
}

export async function requireCapability(
  userId: string,
  capability: UserCapabilities["capabilities"][number],
): Promise<UserCapabilities> {
  const ctx = await loadUserCapabilities(userId);
  if (!ctx || !ctx.capabilities.includes(capability)) {
    throw new Error("Forbidden");
  }
  return ctx;
}

/** Alias used by console pages. */
export const loadAuthzContext = loadUserCapabilities;
