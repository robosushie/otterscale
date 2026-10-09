"use server";

import { unstable_rethrow } from "next/navigation";
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
import { applyInviteMemberships, findPendingInviteByCode, stashInviteCode } from "@/lib/auth/redeem-invite";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { signIn } from "@/lib/auth";
import { isOidcEnabled } from "@/lib/auth/methods";
import { decideCredentialsStep, fail, ok, okVoid, type ActionResult } from "@/lib/actions/result";

function asFail(e: unknown, fallback: string): ActionResult<never> {
  return fail(e instanceof Error ? e.message : fallback);
}

export async function signInWithOidc(): Promise<ActionResult<void>> {
  if (!isOidcEnabled()) {
    return fail("OIDC is not configured.");
  }
  try {
    await signIn("oidc", { redirectTo: "/machines" });
    return okVoid();
  } catch (e) {
    unstable_rethrow(e);
    return asFail(e, "OIDC sign-in failed.");
  }
}

export async function startInviteOidc(code: string): Promise<ActionResult<void>> {
  if (!isOidcEnabled()) return fail("OIDC is not configured.");
  const invite = await findPendingInviteByCode(code);
  if (!invite) return fail("Invalid or expired invite.");
  await stashInviteCode(code);
  try {
    await signIn("oidc", { redirectTo: "/machines" });
    return okVoid();
  } catch (e) {
    unstable_rethrow(e);
    return asFail(e, "OIDC sign-in failed.");
  }
}

export async function lookupInviteCode(
  code: string,
): Promise<ActionResult<{ email: string; username: string }>> {
  const invite = await findPendingInviteByCode(code);
  if (!invite) return fail("Invalid or expired invite.");
  return ok({ email: invite.email, username: invite.username });
}

export async function resolveLocalIdentity(email: string): Promise<string> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed.includes("@")) return "";
  const user = await prisma.user.findUnique({
    where: { email: trimmed },
    select: { username: true },
  });
  if (user?.username) return user.username;
  return trimmed.split("@")[0] ?? "";
}

export async function credentialsNeedsTotp(username: string, password: string): Promise<boolean> {
  const ident = username.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ username: ident }, { email: ident.toLowerCase() }] },
  });
  if (!user?.passwordHash) return false;
  if (!(await verifyPassword(password, user.passwordHash))) return false;
  return user.totpEnabled;
}

export async function signInWithCredentials(formData: FormData): Promise<ActionResult<void>> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();

  const needsTotp = totpCode ? false : await credentialsNeedsTotp(username, password);
  const decision = decideCredentialsStep({ username, password, totpCode, needsTotp });
  if ("error" in decision) return fail(decision.error);
  if ("totpRequired" in decision) return fail("", { totpRequired: true });

  try {
    await signIn("credentials", {
      username,
      password,
      totpCode: totpCode || undefined,
      redirectTo: "/machines",
    });
    return okVoid();
  } catch (e) {
    unstable_rethrow(e);
    return fail("Invalid username, password, or authenticator code.");
  }
}

export async function setupOwnerAccount(formData: FormData): Promise<ActionResult<void>> {
  if (await hasOwner()) {
    return fail("Setup already complete.");
  }

  const env = getServerEnv();
  const setupToken = String(formData.get("setupToken") ?? "").trim();
  if (env.AUTH_SETUP_TOKEN && setupToken !== env.AUTH_SETUP_TOKEN) {
    return fail("Invalid setup token.");
  }

  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  const totpSecret = String(formData.get("totpSecret") ?? "").trim();

  const usernameErr = validateUsername(username);
  if (usernameErr) return fail(usernameErr);
  if (!email.includes("@")) return fail("Valid email required.");
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) return fail(pwErr);
  if (password !== confirm) return fail("Passwords do not match.");
  if (!totpSecret || !totpCode) return fail("TOTP enrollment required.");
  if (!verifyTotpCode(totpSecret, totpCode)) return fail("Invalid TOTP code.");

  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) return fail("Username or email already in use.");

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

  try {
    await signIn("credentials", {
      username,
      password,
      totpCode,
      redirectTo: "/machines",
    });
    return okVoid();
  } catch (e) {
    unstable_rethrow(e);
    return asFail(e, "Account created but sign-in failed.");
  }
}

export async function generateSetupTotpSecret(username: string): Promise<
  ActionResult<{ secret: string; uri: string }>
> {
  const usernameErr = validateUsername(username);
  if (usernameErr) return fail(usernameErr);
  const secret = generateTotpSecret();
  const { buildTotpUri } = await import("@/lib/auth/totp");
  return ok({ secret, uri: buildTotpUri(secret, username) });
}

export async function acceptInviteAccount(formData: FormData): Promise<ActionResult<void>> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const inviteCode = String(formData.get("inviteCode") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const totpCode = String(formData.get("totpCode") ?? "").trim();
  const totpSecret = String(formData.get("totpSecret") ?? "").trim();

  const rl = checkRateLimit(`invite:${email}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return fail("Too many attempts. Try again later.");

  const usernameErr = validateUsername(username);
  if (usernameErr) return fail(usernameErr);
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) return fail(pwErr);
  if (password !== confirm) return fail("Passwords do not match.");
  if (!totpSecret || !totpCode) return fail("TOTP enrollment required.");
  if (!verifyTotpCode(totpSecret, totpCode)) return fail("Invalid TOTP code.");

  const invite = await findPendingInviteByCode(inviteCode);
  if (!invite) return fail("Invalid or expired invite.");
  if (invite.email !== email || invite.username.toLowerCase() !== username.toLowerCase()) {
    return fail("Invite does not match this account.");
  }

  const env = getServerEnv();
  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
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

      await applyInviteMemberships(tx, created.id, email, invite);
      return created;
    });
  } catch (e) {
    return asFail(e, "Could not accept invite.");
  }

  await appendAuditEvent({
    organizationId: invite.organizationId,
    actorId: user.id,
    action: "member.invite_redeemed",
    resourceType: "user_invite",
    resourceId: invite.id,
  });

  try {
    await signIn("credentials", {
      username,
      password,
      totpCode,
      redirectTo: "/machines",
    });
    return okVoid();
  } catch (e) {
    unstable_rethrow(e);
    return asFail(e, "Account created but sign-in failed.");
  }
}

export async function prepareInviteTotp(username: string): Promise<
  ActionResult<{ secret: string; uri: string }>
> {
  const usernameErr = validateUsername(username);
  if (usernameErr) return fail(usernameErr);
  const secret = generateTotpSecret();
  const { buildTotpUri } = await import("@/lib/auth/totp");
  return ok({ secret, uri: buildTotpUri(secret, username) });
}
