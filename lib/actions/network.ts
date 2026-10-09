"use server";

import { revalidatePath } from "next/cache";
import { AuditCategory } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import {
  createPreAuthKey,
  deleteNode,
  expirePreAuthKey,
  formatHeadscaleError,
  isHeadscaleConfigured,
  renameNode,
  setNodeTags,
} from "@/lib/headscale/client";
import { parseAuthKeyExpiry } from "@/lib/headscale/expiry";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { workspaceTagName } from "@/lib/console/user-role";
import { compileAndApply } from "@/lib/services/policy-apply";
import { fail, ok, okVoid, type ActionResult } from "@/lib/actions/result";

function revalidateMachines() {
  revalidatePath("/machines");
  revalidatePath("/apps");
  revalidatePath("/audit/network");
  revalidatePath("/settings/keys");
}

async function applyPolicyQuiet(actorId: string) {
  try {
    await compileAndApply(actorId);
  } catch {
    /* Headscale optional in local dev */
  }
}

async function aclTagsFor(workspaceIds: string[], tagIds: string[]): Promise<string[]> {
  const [groups, tags] = await Promise.all([
    prisma.group.findMany({ where: { id: { in: workspaceIds } } }),
    prisma.tag.findMany({ where: { id: { in: tagIds } } }),
  ]);
  return [...groups.map((g) => workspaceTagName(g.name)), ...tags.map((t) => t.aclTag)];
}

export async function createAuthKey(formData: FormData): Promise<ActionResult<string>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const workspaceIds = formData.getAll("workspaceIds").map(String).filter(Boolean);
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  const reusable = formData.get("reusable") === "on";
  const expiration = parseAuthKeyExpiry(String(formData.get("expiration") ?? ""));
  if (!expiration) return fail("Invalid expiry");
  if (workspaceIds.length === 0) return fail("Select at least one workspace");

  if (!isHeadscaleConfigured()) {
    return fail("Headscale is not configured");
  }

  try {
    const aclTags = await aclTagsFor(workspaceIds, tagIds);
    const { key } = await createPreAuthKey({
      aclTags,
      reusable,
      ephemeral: !reusable,
      expiration,
    });

    const org = await getDefaultOrganization();
    await appendAuditEvent({
      organizationId: org.id,
      actorId: session.user.id,
      action: "authkey.created",
      category: AuditCategory.NETWORK,
      afterJson: { workspaceIds, tagIds, reusable, aclTags },
    });

    revalidatePath("/settings/keys");
    revalidatePath("/audit/network");
    return ok(key);
  } catch (e) {
    return fail(formatHeadscaleError(e));
  }
}

export async function expireAuthKey(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return fail("Key required");
  if (!isHeadscaleConfigured()) return fail("Headscale is not configured");

  try {
    await expirePreAuthKey(key);
  } catch (e) {
    return fail(formatHeadscaleError(e));
  }

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "authkey.expired",
    category: AuditCategory.NETWORK,
    afterJson: { keyPrefix: key.slice(0, 8) },
  });
  revalidateMachines();
  return okVoid();
}

export async function updateMachine(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  const authz = await requireCapability(session.user.id, "network.manage");
  const machineId = String(formData.get("machineId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const workspaceIds = formData.getAll("workspaceIds").map(String).filter(Boolean);
  const tagIds = formData.getAll("tagIds").map(String).filter(Boolean);
  if (!machineId) return fail("Machine required");
  if (!name) return fail("Name required");
  if (workspaceIds.length === 0 && !authz.isPlatformAdmin) {
    return fail("Select at least one workspace");
  }

  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    include: { workspaces: true, tags: true },
  });
  if (!machine) return fail("Machine not found");

  if (isHeadscaleConfigured()) {
    try {
      if (name !== machine.name) {
        await renameNode(machine.headscaleNodeId, name);
      }
      const aclTags = await aclTagsFor(workspaceIds, tagIds);
      await setNodeTags(machine.headscaleNodeId, aclTags);
    } catch (e) {
      return fail(formatHeadscaleError(e));
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.machine.update({
      where: { id: machineId },
      data: { name, createdById: machine.createdById ?? session.user.id },
    });
    await tx.machineWorkspace.deleteMany({ where: { machineId } });
    await tx.machineTag.deleteMany({ where: { machineId } });
    if (workspaceIds.length) {
      await tx.machineWorkspace.createMany({
        data: workspaceIds.map((groupId) => ({ machineId, groupId })),
      });
    }
    if (tagIds.length) {
      await tx.machineTag.createMany({
        data: tagIds.map((tagId) => ({ machineId, tagId })),
      });
    }
  });

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "machine.updated",
    category: AuditCategory.NETWORK,
    resourceType: "machine",
    resourceId: machineId,
    afterJson: { name, workspaceIds, tagIds },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateMachines();
  return okVoid();
}

export async function deleteMachine(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const machineId = String(formData.get("machineId") ?? "");
  const machine = await prisma.machine.findUnique({ where: { id: machineId } });
  if (!machine) return fail("Machine not found");

  if (isHeadscaleConfigured()) {
    try {
      await deleteNode(machine.headscaleNodeId);
    } catch (e) {
      return fail(formatHeadscaleError(e));
    }
  }

  await prisma.machine.delete({ where: { id: machineId } });
  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "machine.deleted",
    category: AuditCategory.NETWORK,
    resourceType: "machine",
    resourceId: machineId,
    afterJson: { name: machine.name, headscaleNodeId: machine.headscaleNodeId },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateMachines();
  return okVoid();
}
