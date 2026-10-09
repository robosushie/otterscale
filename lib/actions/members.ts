"use server";

import { revalidatePath } from "next/cache";
import { PlatformRole, TenantRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { generateInviteCode, hashInviteCode } from "@/lib/auth/invite";
import { validateUsername } from "@/lib/auth/username";
import { fail, ok, okVoid, type ActionResult } from "@/lib/actions/result";
import { compileAndApply } from "@/lib/services/policy-apply";

const INVITE_TTL_DAYS = 7;

export type CreateInviteResult = {
  code: string;
  email: string;
  username: string;
  expiresAt: Date;
  acceptPath: string;
};

export async function createUserInvite(
  formData: FormData,
): Promise<ActionResult<CreateInviteResult>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "members.invite");
  const org = await getDefaultOrganization();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "MEMBER").trim();
  const workspaceIds = [...new Set(formData.getAll("workspaceIds").map(String).filter(Boolean))];

  if (!email.includes("@")) return fail("Valid email required.");
  const usernameErr = validateUsername(username);
  if (usernameErr) return fail(usernameErr);

  let platformRole: PlatformRole | null = null;
  let tenantRole: TenantRole;
  if (roleRaw === "SUPER_ADMIN") {
    await requireCapability(session.user.id, "platform.manage_admins");
    platformRole = PlatformRole.SUPER_ADMIN;
    tenantRole = TenantRole.ADMIN;
  } else if (roleRaw === "ADMIN" || roleRaw === "MEMBER") {
    tenantRole = TenantRole[roleRaw];
  } else {
    return fail("Invalid role.");
  }

  const groups = await prisma.group.findMany({
    where: { organizationId: org.id, id: { in: workspaceIds } },
    select: { id: true },
  });
  if (groups.length !== workspaceIds.length) return fail("Unknown workspace.");

  await prisma.userInvite.updateMany({
    where: {
      organizationId: org.id,
      email,
      redeemedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const code = generateInviteCode();
  const codeHash = await hashInviteCode(code);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.userInvite.create({
    data: {
      organizationId: org.id,
      email,
      username,
      codeHash,
      tenantRole,
      platformRole,
      createdById: session.user.id,
      expiresAt,
      workspaces: { create: workspaceIds.map((groupId) => ({ groupId })) },
    },
  });

  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "member.invite_created",
    resourceType: "user_invite",
    resourceId: invite.id,
    afterJson: { email, username, tenantRole, platformRole, workspaceIds, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/users");
  revalidatePath("/settings/users");

  return ok({
    code,
    email,
    username,
    expiresAt,
    acceptPath: "/signin?signup=1",
  });
}

export async function revokeUserInvite(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "members.invite");
  const org = await getDefaultOrganization();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) return fail("Invite id required.");

  await prisma.userInvite.updateMany({
    where: {
      id: inviteId,
      organizationId: org.id,
      redeemedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/users");
  revalidatePath("/settings/users");
  return okVoid();
}

export async function assignWorkspaceMembership(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "members.invite");
  const userId = String(formData.get("userId") ?? "");
  const groupId = String(formData.get("groupId") ?? "");
  const roleRaw = String(formData.get("role") ?? "MEMBER");
  const role = TenantRole[roleRaw as keyof typeof TenantRole] ?? TenantRole.MEMBER;
  if (!userId || !groupId) return fail("User and workspace required");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return fail("User not found");

  await prisma.workspaceMembership.upsert({
    where: { userId_groupId: { userId, groupId } },
    create: { userId, groupId, role },
    update: { role },
  });
  await prisma.groupMember.upsert({
    where: { groupId_email: { groupId, email: user.email } },
    create: { groupId, email: user.email, userId },
    update: { userId },
  });

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "workspace.member_assigned",
    resourceType: "user",
    resourceId: userId,
    afterJson: { groupId, role },
  });
  try {
    await compileAndApply(session.user.id);
  } catch {
    /* Headscale optional */
  }
  revalidatePath("/users");
  revalidatePath("/workspaces");
  revalidatePath("/settings/users");
  return okVoid();
}

export async function assignWorkspaceMembershipForm(formData: FormData): Promise<void> {
  const result = await assignWorkspaceMembership(formData);
  if (!result.ok) throw new Error(result.error);
}

function revalidateUsers() {
  revalidatePath("/users");
  revalidatePath("/settings/users");
  revalidatePath("/workspaces");
}

export async function updateUserAccess(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  const authz = await requireCapability(session.user.id, "members.invite");
  const userId = String(formData.get("userId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");
  const workspaceIds = [...new Set(formData.getAll("workspaceIds").map(String).filter(Boolean))];
  if (!userId) return fail("User required.");
  if (roleRaw !== "SUPER_ADMIN" && roleRaw !== "ADMIN" && roleRaw !== "MEMBER") {
    return fail("Invalid role.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformMemberships: true },
  });
  if (!user) return fail("User not found.");
  const isOwner = user.platformMemberships.some((membership) => membership.role === PlatformRole.OWNER);
  if (isOwner) return fail("The owner cannot be edited here.");

  const isSuper = user.platformMemberships.some((membership) => membership.role === PlatformRole.SUPER_ADMIN);
  const canAssignSuper = hasCapability(authz.capabilities, "platform.manage_admins");
  if ((roleRaw === "SUPER_ADMIN" || isSuper) && !canAssignSuper) {
    return fail("Only the owner can change a Super admin.");
  }

  const org = await getDefaultOrganization();
  const groups = await prisma.group.findMany({
    where: { organizationId: org.id, id: { in: workspaceIds } },
    select: { id: true },
  });
  if (groups.length !== workspaceIds.length) return fail("Unknown workspace.");

  const tenantRole = roleRaw === "MEMBER" ? TenantRole.MEMBER : TenantRole.ADMIN;
  await prisma.$transaction(async (tx) => {
    if (roleRaw === "SUPER_ADMIN") {
      await tx.platformMembership.upsert({
        where: { userId_role: { userId, role: PlatformRole.SUPER_ADMIN } },
        create: { userId, role: PlatformRole.SUPER_ADMIN },
        update: {},
      });
    } else {
      await tx.platformMembership.deleteMany({
        where: { userId, role: PlatformRole.SUPER_ADMIN },
      });
    }
    const tenant = await tx.tenantMembership.findFirst({ where: { userId } });
    if (tenant) {
      await tx.tenantMembership.update({ where: { id: tenant.id }, data: { role: tenantRole } });
    } else {
      await tx.tenantMembership.create({ data: { userId, role: tenantRole } });
    }
    await tx.workspaceMembership.deleteMany({ where: { userId } });
    if (workspaceIds.length) {
      await tx.workspaceMembership.createMany({
        data: workspaceIds.map((groupId) => ({ userId, groupId, role: tenantRole })),
      });
    }
    const stale = await tx.groupMember.findMany({ where: { userId } });
    for (const member of stale) {
      if (!workspaceIds.includes(member.groupId)) {
        await tx.groupMember.delete({ where: { id: member.id } });
      }
    }
    for (const groupId of workspaceIds) {
      await tx.groupMember.upsert({
        where: { groupId_email: { groupId, email: user.email } },
        create: { groupId, email: user.email, userId },
        update: { userId },
      });
    }
  });

  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "member.updated",
    resourceType: "user",
    resourceId: userId,
    afterJson: { role: roleRaw, workspaceIds },
  });
  try {
    await compileAndApply(session.user.id);
  } catch {
    /* Headscale optional */
  }
  revalidateUsers();
  return okVoid();
}

export async function deleteConsoleUser(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  const authz = await requireCapability(session.user.id, "members.invite");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return fail("User required.");
  if (userId === session.user.id) return fail("You cannot delete your own account.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { platformMemberships: true },
  });
  if (!user) return fail("User not found.");
  if (user.platformMemberships.some((membership) => membership.role === PlatformRole.OWNER)) {
    return fail("The owner cannot be deleted.");
  }
  if (
    user.platformMemberships.some((membership) => membership.role === PlatformRole.SUPER_ADMIN) &&
    !hasCapability(authz.capabilities, "platform.manage_admins")
  ) {
    return fail("Only the owner can delete a Super admin.");
  }

  await prisma.user.delete({ where: { id: userId } });
  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "member.deleted",
    resourceType: "user",
    resourceId: userId,
    afterJson: { email: user.email },
  });
  revalidateUsers();
  return okVoid();
}
