import { prisma } from "@/lib/db";
import { appendAuditEvent } from "@/lib/audit/write";
import { PlatformRole, TenantRole } from "@prisma/client";

const DEFAULT_ENVS = [
  { slug: "prod", name: "Production", tag: "tag:prod", sortOrder: 0 },
  { slug: "uat", name: "UAT", tag: "tag:uat", sortOrder: 1 },
  { slug: "dev", name: "Development", tag: "tag:dev", sortOrder: 2 },
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
    await tx.platformMembership.createMany({
      data: [
        { userId, role: PlatformRole.OWNER },
        { userId, role: PlatformRole.SUPER_ADMIN },
      ],
      skipDuplicates: true,
    });

    const tenantMem = await tx.tenantMembership.findFirst({ where: { userId } });
    if (!tenantMem) {
      await tx.tenantMembership.create({
        data: { userId, role: TenantRole.TENANT_ADMIN },
      });
    }

    for (const env of DEFAULT_ENVS) {
      await tx.environment.upsert({
        where: {
          organizationId_slug: { organizationId, slug: env.slug },
        },
        create: { organizationId, ...env },
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
          members: { create: { email } },
        },
      });
    } else {
      await tx.groupMember.upsert({
        where: { groupId_email: { groupId: group.id, email } },
        create: { groupId: group.id, email, userId },
        update: { userId },
      });
    }

    await tx.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        setupComplete: true,
        headscaleInternalUrl: process.env.HEADSCALE_INTERNAL_URL,
        headscalePublicUrl: process.env.AUTH_URL,
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
