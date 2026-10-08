"use server";

import { revalidatePath } from "next/cache";
import { TenantRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { generateInviteCode, hashInviteCode } from "@/lib/auth/invite";
import { validateUsername } from "@/lib/auth/username";

const INVITE_TTL_DAYS = 7;

export type CreateInviteResult = {
  code: string;
  email: string;
  username: string;
  expiresAt: Date;
  acceptPath: string;
};

export async function createUserInvite(formData: FormData): Promise<CreateInviteResult> {
  const session = await requireSession();
  await requireCapability(session.user.id, "members.invite");
  const org = await getDefaultOrganization();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const username = String(formData.get("username") ?? "").trim();
  const tenantRoleRaw = String(formData.get("tenantRole") ?? "MEMBER").trim();

  if (!email.includes("@")) throw new Error("Valid email required.");
  const usernameErr = validateUsername(username);
  if (usernameErr) throw new Error(usernameErr);

  const tenantRole = TenantRole[tenantRoleRaw as keyof typeof TenantRole];
  if (!tenantRole) throw new Error("Invalid tenant role.");

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
      createdById: session.user.id,
      expiresAt,
    },
  });

  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "member.invite_created",
    resourceType: "user_invite",
    resourceId: invite.id,
    afterJson: { email, username, tenantRole, expiresAt: expiresAt.toISOString() },
  });

  revalidatePath("/workspace");

  return {
    code,
    email,
    username,
    expiresAt,
    acceptPath: `/accept-invite?email=${encodeURIComponent(email)}`,
  };
}

export async function revokeUserInvite(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "members.invite");
  const org = await getDefaultOrganization();
  const inviteId = String(formData.get("inviteId") ?? "");
  if (!inviteId) throw new Error("Invite id required.");

  await prisma.userInvite.updateMany({
    where: {
      id: inviteId,
      organizationId: org.id,
      redeemedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  revalidatePath("/workspace");
}
