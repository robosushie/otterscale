"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability, loadUserCapabilities } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { PlatformRole } from "@prisma/client";

export async function addSuperAdmin(formData: FormData) {
  const session = await requireSession();
  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx?.isOwner) throw new Error("Only the Owner can add super admins");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User must sign in once before being promoted");

  await prisma.platformMembership.upsert({
    where: { userId_role: { userId: user.id, role: PlatformRole.SUPER_ADMIN } },
    create: { userId: user.id, role: PlatformRole.SUPER_ADMIN },
    update: {},
  });

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "platform.super_admin_added",
    resourceId: user.id,
    afterJson: { email },
  });
  revalidatePath("/settings");
  revalidatePath("/settings/general");
}

export async function removeSuperAdmin(formData: FormData) {
  const session = await requireSession();
  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx?.isOwner) throw new Error("Only the Owner can remove super admins");

  const userId = String(formData.get("userId"));
  const target = await prisma.platformMembership.findFirst({
    where: { userId, role: PlatformRole.SUPER_ADMIN },
  });
  if (!target) return;

  await prisma.platformMembership.delete({ where: { id: target.id } });
  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "platform.super_admin_removed",
    resourceId: userId,
  });
  revalidatePath("/settings");
  revalidatePath("/settings/general");
}

export async function updateOrgSettings(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "platform.settings");
  const org = await getDefaultOrganization();
  const name = formData.has("name") ? String(formData.get("name") ?? "").trim() : "";
  const data: {
    relayMapUrl?: string | null;
    appsBaseDomain?: string;
  } = {};
  if (formData.has("relayMapUrl")) {
    data.relayMapUrl = String(formData.get("relayMapUrl") ?? "").trim() || null;
  }
  if (formData.has("appsBaseDomain")) {
    const appsBaseDomain = String(formData.get("appsBaseDomain") ?? "").trim();
    if (appsBaseDomain) data.appsBaseDomain = appsBaseDomain;
  }

  if (name) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { name },
    });
  }

  if (Object.keys(data).length) {
    await prisma.organizationSettings.update({
      where: { organizationId: org.id },
      data,
    });
  }
  revalidatePath("/settings");
  revalidatePath("/settings/general");
  revalidatePath("/settings/devices");
}

export async function updateDeviceSettings(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const org = await getDefaultOrganization();
  const expiryRaw = String(formData.get("defaultAuthKeyExpiryHours") ?? "").trim();
  const defaultAuthKeyExpiryHours = Number(expiryRaw);
  if (!Number.isFinite(defaultAuthKeyExpiryHours) || defaultAuthKeyExpiryHours < 1) {
    throw new Error("Expiry hours must be at least 1");
  }
  await prisma.organizationSettings.update({
    where: { organizationId: org.id },
    data: { defaultAuthKeyExpiryHours },
  });
  revalidatePath("/settings/devices");
  revalidatePath("/machines");
}
