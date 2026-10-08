"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { previewPolicy, applyPolicy, rollbackPolicy } from "@/lib/services/policy-apply";

export async function createEnvironment(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const org = await getDefaultOrganization();
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? slug).trim();
  const tag = String(formData.get("tag") ?? `tag:${slug}`).trim();
  if (!slug) throw new Error("Slug required");

  await prisma.environment.create({
    data: { organizationId: org.id, slug, name, tag },
  });
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "environment.created",
    afterJson: { slug, tag },
  });
  revalidatePath("/workspace");
}

export async function createGroup(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const org = await getDefaultOrganization();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name required");

  await prisma.group.create({
    data: { organizationId: org.id, name },
  });
  revalidatePath("/workspace");
}

export async function addGroupMember(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const groupId = String(formData.get("groupId"));
  const email = String(formData.get("email") ?? "").trim();
  await prisma.groupMember.create({ data: { groupId, email } });
  revalidatePath("/workspace");
}

export async function createAccessRule(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  const org = await getDefaultOrganization();
  const groupId = String(formData.get("groupId"));
  const environmentId = String(formData.get("environmentId"));
  const ports = String(formData.get("ports") ?? "*");

  await prisma.accessRule.create({
    data: { organizationId: org.id, groupId, environmentId, ports },
  });
  revalidatePath("/workspace");
}

export async function previewPolicyAction() {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  return previewPolicy(session.user.id);
}

export async function applyPolicyAction(snapshotId: string) {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  await applyPolicy(snapshotId, session.user.id);
  revalidatePath("/workspace");
  revalidatePath("/audit");
}

export async function rollbackPolicyAction() {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  await rollbackPolicy(session.user.id);
  revalidatePath("/workspace");
  revalidatePath("/audit");
}
