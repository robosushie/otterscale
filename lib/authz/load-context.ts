import { prisma, sqliteReady } from "@/lib/db";
import { resolveCapabilities } from "@/lib/authz/permissions";
import type { UserCapabilities } from "@/types/roles";

export async function loadUserCapabilities(
  userId: string,
): Promise<UserCapabilities | null> {
  await sqliteReady;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      platformMemberships: true,
      tenantMemberships: { orderBy: { createdAt: "asc" }, take: 1 },
      workspaceMemberships: true,
    },
  });
  if (!user) return null;

  const org = await prisma.organization.findFirst({
    include: { settings: true },
  });
  const implicit = org?.settings?.superAdminsImplicitTenantAdmin ?? true;

  const platformRoles = user.platformMemberships.map((m) => m.role as "OWNER" | "SUPER_ADMIN");
  const isPlatformAdmin = platformRoles.includes("OWNER") || platformRoles.includes("SUPER_ADMIN");
  const tenantMembership = user.tenantMemberships[0];
  const tenantRole = (tenantMembership?.role ?? null) as UserCapabilities["tenantRole"];

  const capabilities = resolveCapabilities({
    platformRoles,
    tenantRole,
    superAdminsImplicitTenantAdmin: implicit,
  });

  const workspaceIds = isPlatformAdmin
    ? (await prisma.group.findMany({ where: { organizationId: org?.id }, select: { id: true } })).map(
        (g) => g.id,
      )
    : user.workspaceMemberships.map((m) => m.groupId);

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    platformRoles,
    tenantRole,
    capabilities,
    isOwner: platformRoles.includes("OWNER"),
    isPlatformAdmin,
    workspaceIds,
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

export const loadAuthzContext = loadUserCapabilities;
