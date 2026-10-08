"use server";

import { prisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { hasOwner } from "@/lib/auth/owner";
import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/auth/password";
import { validateUsername } from "@/lib/auth/username";
import {
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { ensureOwnerBootstrap } from "@/lib/auth/bootstrap";
import { appendAuditEvent } from "@/lib/audit/write";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { verifyInviteCode } from "@/lib/auth/invite";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { isLocalAuthEnabled } from "@/lib/auth/methods";
import { signIn } from "@/lib/auth";

export async function credentialsNeedsTotp(username: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user?.passwordHash) return false;
  if (!(await verifyPassword(password, user.passwordHash))) return false;
  return user.totpEnabled;
}

export async function signInWithCredentials(formData: FormData) {
  if (!isLocalAuthEnabled()) throw new Error("Local authentication is disabled.");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  if (!username || !password) throw new Error("Username and password required.");

  if (!totpCode) {
    const needs = await credentialsNeedsTotp(username, password);
    if (needs) throw new Error("TOTP_REQUIRED");
  }

  await signIn("credentials", {
    username,
    password,
    totpCode: totpCode || undefined,
    redirectTo: "/workspace",
  });
}

export async function setupOwnerAccount(formData: FormData) {
  if (!isLocalAuthEnabled()) {
    throw new Error("Local authentication is disabled.");
  }
  if (await hasOwner()) {
    throw new Error("Setup already complete.");
  }

  const env = getServerEnv();
  const setupToken = String(formData.get("setupToken") ?? "").trim();
  if (env.AUTH_SETUP_TOKEN && setupToken !== env.AUTH_SETUP_TOKEN) {
    throw new Error("Invalid setup token.");
  }

  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  const totpSecret = String(formData.get("totpSecret") ?? "").trim();

  const usernameErr = validateUsername(username);
  if (usernameErr) throw new Error(usernameErr);
  if (!email.includes("@")) throw new Error("Valid email required.");
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) throw new Error(pwErr);
  if (password !== confirm) throw new Error("Passwords do not match.");
  if (!totpSecret || !totpCode) throw new Error("TOTP enrollment required.");
  if (!verifyTotpCode(totpSecret, totpCode)) throw new Error("Invalid TOTP code.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) throw new Error("Username or email already in use.");

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      totpSecret: encryptTotpSecret(totpSecret, env.AUTH_SECRET),
      totpEnabled: true,
      passwordChangedAt: new Date(),
    },
  });

  await ensureOwnerBootstrap(user.id, user.email);

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: user.id,
    action: "auth.totp_enrolled",
    resourceType: "user",
    resourceId: user.id,
  });

  await signIn("credentials", {
    username,
    password,
    totpCode,
    redirectTo: "/workspace",
  });
}

export async function generateSetupTotpSecret(username: string): Promise<{
  secret: string;
  uri: string;
}> {
  if (!isLocalAuthEnabled()) throw new Error("Local auth disabled.");
  const usernameErr = validateUsername(username);
  if (usernameErr) throw new Error(usernameErr);
  const secret = generateTotpSecret();
  const { buildTotpUri } = await import("@/lib/auth/totp");
  return { secret, uri: buildTotpUri(secret, username) };
}

export async function acceptInviteAccount(formData: FormData) {
  if (!isLocalAuthEnabled()) {
    throw new Error("Local authentication is disabled.");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  const totpSecret = String(formData.get("totpSecret") ?? "").trim();

  const rl = checkRateLimit(`invite:${email}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) throw new Error("Too many attempts. Try again later.");

  const usernameErr = validateUsername(username);
  if (usernameErr) throw new Error(usernameErr);
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) throw new Error(pwErr);
  if (password !== confirm) throw new Error("Passwords do not match.");
  if (!totpSecret || !totpCode) throw new Error("TOTP enrollment required.");
  if (!verifyTotpCode(totpSecret, totpCode)) throw new Error("Invalid TOTP code.");

  const invite = await prisma.userInvite.findFirst({
    where: {
      email,
      revokedAt: null,
      redeemedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) throw new Error("Invalid or expired invite.");
  if (invite.username.toLowerCase() !== username.toLowerCase()) {
    throw new Error("Username does not match invite.");
  }
  const codeOk = await verifyInviteCode(inviteCode, invite.codeHash);
  if (!codeOk) throw new Error("Invalid invite code.");

  const env = getServerEnv();
  const passwordHash = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) throw new Error("Username or email already in use.");

    const created = await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        totpSecret: encryptTotpSecret(totpSecret, env.AUTH_SECRET),
        totpEnabled: true,
        passwordChangedAt: new Date(),
      },
    });

    await tx.tenantMembership.create({
      data: {
        userId: created.id,
        role: invite.tenantRole,
      },
    });

    await tx.groupMember.updateMany({
      where: { email, userId: null },
      data: { userId: created.id },
    });

    await tx.userInvite.update({
      where: { id: invite.id },
      data: { redeemedAt: new Date(), redeemedByUserId: created.id },
    });

    return created;
  });

  await appendAuditEvent({
    organizationId: invite.organizationId,
    actorId: user.id,
    action: "member.invite_redeemed",
    resourceType: "user_invite",
    resourceId: invite.id,
  });

  await signIn("credentials", {
    username,
    password,
    totpCode,
    redirectTo: "/workspace",
  });
}

export async function prepareInviteTotp(username: string) {
  const usernameErr = validateUsername(username);
  if (usernameErr) throw new Error(usernameErr);
  const secret = generateTotpSecret();
  const { buildTotpUri } = await import("@/lib/auth/totp");
  return { secret, uri: buildTotpUri(secret, username) };
}
