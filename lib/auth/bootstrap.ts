import { prisma } from "@/lib/db";
import { appendAuditEvent } from "@/lib/audit/write";
import { PlatformRole, TenantRole } from "@prisma/client";
import { aclTagForSlug } from "@/lib/console/user-role";

const DEFAULT_TAGS = [
  { slug: "prod", name: "prod" },
  { slug: "uat", name: "uat" },
  { slug: "dev", name: "dev" },
];

export async function ensureOwnerBootstrap(userId: string, email: string): Promise<boolean> {
  const existingOwner = await prisma.platformMembership.findFirst({
    where: { role: PlatformRole.OWNER },
  });
  if (existingOwner) return false;

  let org = await prisma.organization.findFirst({ include: { settings: true } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Otterscale",
        slug: "default",
        settings: { create: { setupComplete: false } },
      },
      include: { settings: true },
    });
  }
  const organizationId = org.id;

  await prisma.$transaction(async (tx) => {
    for (const role of [PlatformRole.OWNER, PlatformRole.SUPER_ADMIN] as const) {
      await tx.platformMembership.upsert({
        where: { userId_role: { userId, role } },
        update: {},
        create: { userId, role },
      });
    }

    const tenantMem = await tx.tenantMembership.findFirst({ where: { userId } });
    if (!tenantMem) {
      await tx.tenantMembership.create({
        data: { userId, role: TenantRole.ADMIN },
      });
    }

    for (const tag of DEFAULT_TAGS) {
      await tx.tag.upsert({
        where: { organizationId_slug: { organizationId, slug: tag.slug } },
        create: {
          organizationId,
          name: tag.name,
          slug: tag.slug,
          aclTag: aclTagForSlug(tag.slug),
        },
        update: {},
      });
    }

    let group = await tx.group.findUnique({
      where: { organizationId_name: { organizationId, name: "platform-admins" } },
    });
    if (!group) {
      group = await tx.group.create({
        data: {
          organizationId,
          name: "platform-admins",
          members: { create: { email, userId } },
        },
      });
    } else {
      await tx.groupMember.upsert({
        where: { groupId_email: { groupId: group.id, email } },
        create: { groupId: group.id, email, userId },
        update: { userId },
      });
    }

    await tx.workspaceMembership.upsert({
      where: { userId_groupId: { userId, groupId: group.id } },
      create: { userId, groupId: group.id, role: TenantRole.ADMIN },
      update: {},
    });

    await tx.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        setupComplete: true,
        headscaleInternalUrl: process.env.HEADSCALE_INTERNAL_URL,
        headscalePublicUrl: process.env.HEADSCALE_PUBLIC_URL ?? process.env.AUTH_URL,
        appsBaseDomain: "apps.localhost",
      },
      update: { setupComplete: true },
    });
  });

  await appendAuditEvent({
    organizationId,
    actorId: userId,
    action: "platform.owner_created",
    resourceType: "user",
    resourceId: userId,
  });

  return true;
}
