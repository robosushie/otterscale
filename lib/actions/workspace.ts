"use server";

import { revalidatePath } from "next/cache";
import { TenantRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { previewPolicy, applyPolicy, rollbackPolicy, compileAndApply } from "@/lib/services/policy-apply";
import { aclTagForSlug } from "@/lib/console/user-role";
import { fail, okVoid, type ActionResult } from "@/lib/actions/result";

async function applyPolicyQuiet(actorId: string) {
  try {
    await compileAndApply(actorId);
  } catch {
    /* Headscale optional */
  }
}

function revalidateAccess() {
  revalidatePath("/workspaces");
  revalidatePath("/policies");
  revalidatePath("/machines");
  revalidatePath("/users");
}

export async function createWorkspace(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const org = await getDefaultOrganization();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return fail("Name required");

  const group = await prisma.group.create({
    data: { organizationId: org.id, name },
  });
  const email = session.user.email?.trim().toLowerCase();
  await prisma.workspaceMembership.create({
    data: { userId: session.user.id, groupId: group.id, role: TenantRole.ADMIN },
  });
  if (email) {
    await prisma.groupMember.create({
      data: { groupId: group.id, email, userId: session.user.id },
    });
  }
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "workspace.created",
    afterJson: { name },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateAccess();
  return okVoid();
}

export async function addWorkspaceMember(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const groupId = String(formData.get("groupId"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "MEMBER");
  const role = TenantRole[roleRaw as keyof typeof TenantRole] ?? TenantRole.MEMBER;
  if (!email.includes("@")) return fail("Valid email required.");

  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.groupMember.upsert({
    where: { groupId_email: { groupId, email } },
    create: { groupId, email, userId: user?.id },
    update: { userId: user?.id },
  });
  if (user) {
    await prisma.workspaceMembership.upsert({
      where: { userId_groupId: { userId: user.id, groupId } },
      create: { userId: user.id, groupId, role },
      update: { role },
    });
  }
  await applyPolicyQuiet(session.user.id);
  revalidateAccess();
  return okVoid();
}

export async function createTag(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.manage");
  const org = await getDefaultOrganization();
  const raw = String(formData.get("name") ?? "").trim();
  if (!raw) return fail("Tag name required");
  const slug = raw.replace(/^tag:/i, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  await prisma.tag.create({
    data: {
      organizationId: org.id,
      name: slug,
      slug,
      aclTag: aclTagForSlug(slug),
    },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateAccess();
  return okVoid();
}

export async function createAccessRule(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  const org = await getDefaultOrganization();
  const groupId = String(formData.get("groupId"));
  const tagId = String(formData.get("tagId") ?? "") || null;
  const ports = String(formData.get("ports") ?? "*");
  await prisma.accessRule.create({
    data: { organizationId: org.id, groupId, tagId, ports },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateAccess();
  return okVoid();
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
  revalidateAccess();
  revalidatePath("/audit");
  revalidatePath("/audit/system");
}

export async function rollbackPolicyAction() {
  const session = await requireSession();
  await requireCapability(session.user.id, "workspace.policy");
  await rollbackPolicy(session.user.id);
  revalidateAccess();
  revalidatePath("/audit");
}

export { createWorkspace as createGroup, addWorkspaceMember as addGroupMember };

async function unwrap(result: Promise<ActionResult<void>>): Promise<void> {
  const value = await result;
  if (!value.ok) throw new Error(value.error);
}

export async function createWorkspaceForm(formData: FormData): Promise<void> {
  await unwrap(createWorkspace(formData));
}

export async function addWorkspaceMemberForm(formData: FormData): Promise<void> {
  await unwrap(addWorkspaceMember(formData));
}

export async function createTagForm(formData: FormData): Promise<void> {
  await unwrap(createTag(formData));
}

export async function createAccessRuleForm(formData: FormData): Promise<void> {
  await unwrap(createAccessRule(formData));
}

export {
  createWorkspaceForm as createGroupForm,
  addWorkspaceMemberForm as addGroupMemberForm,
};
