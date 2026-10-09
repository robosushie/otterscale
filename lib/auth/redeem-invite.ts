import { cookies } from "next/headers";
import { PlatformRole, type Prisma, type TenantRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyInviteCode } from "@/lib/auth/invite";

export const INVITE_COOKIE = "otterscale_invite";

export type PendingInvite = {
  id: string;
  email: string;
  username: string;
  tenantRole: TenantRole;
  platformRole: PlatformRole | null;
  organizationId: string;
  workspaces: { groupId: string }[];
};

export async function findPendingInviteByCode(code: string): Promise<PendingInvite | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const invites = await prisma.userInvite.findMany({
    where: { revokedAt: null, redeemedAt: null, expiresAt: { gt: new Date() } },
    include: { workspaces: { select: { groupId: true } } },
    orderBy: { createdAt: "desc" },
  });
  for (const invite of invites) {
    if (await verifyInviteCode(trimmed, invite.codeHash)) return invite;
  }
  return null;
}

export async function applyInviteMemberships(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string,
  invite: PendingInvite,
) {
  if (invite.platformRole === PlatformRole.SUPER_ADMIN) {
    await tx.platformMembership.upsert({
      where: { userId_role: { userId, role: PlatformRole.SUPER_ADMIN } },
      create: { userId, role: PlatformRole.SUPER_ADMIN },
      update: {},
    });
  }

  const tenant = await tx.tenantMembership.findFirst({ where: { userId } });
  if (!tenant) {
    await tx.tenantMembership.create({
      data: { userId, role: invite.tenantRole },
    });
  } else {
    await tx.tenantMembership.update({
      where: { id: tenant.id },
      data: { role: invite.tenantRole },
    });
  }

  const groupIds = new Set(invite.workspaces.map((row) => row.groupId));
  const linked = await tx.groupMember.findMany({ where: { email } });
  for (const member of linked) groupIds.add(member.groupId);

  for (const groupId of groupIds) {
    await tx.groupMember.upsert({
      where: { groupId_email: { groupId, email } },
      create: { groupId, email, userId },
      update: { userId },
    });
    await tx.workspaceMembership.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: { userId, groupId, role: invite.tenantRole },
      update: { role: invite.tenantRole },
    });
  }

  await tx.userInvite.update({
    where: { id: invite.id },
    data: { redeemedAt: new Date(), redeemedByUserId: userId },
  });
}

export async function stashInviteCode(code: string) {
  const jar = await cookies();
  jar.set(INVITE_COOKIE, code.trim(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
    secure: process.env.AUTH_URL?.startsWith("https://") ?? false,
  });
}

/** Returns false when a stashed invite code does not match the signed-in email. */
export async function redeemStashedInvite(
  userId: string,
  email: string | null | undefined,
): Promise<boolean> {
  const jar = await cookies();
  const code = jar.get(INVITE_COOKIE)?.value;
  if (!code) return true;
  jar.delete(INVITE_COOKIE);
  const invite = await findPendingInviteByCode(code);
  if (!invite || !email || invite.email.toLowerCase() !== email.toLowerCase()) return false;
  await prisma.$transaction((tx) => applyInviteMemberships(tx, userId, invite.email, invite));
  return true;
}
