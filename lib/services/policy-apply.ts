import { prisma } from "@/lib/db";
import { compilePolicy, type CompileInput } from "@/lib/policy/compiler";
import { lintPolicyInput } from "@/lib/policy/lint";
import { putPolicy, isHeadscaleConfigured } from "@/lib/headscale/client";
import { appendAuditEvent } from "@/lib/audit/write";
import { PolicySnapshotStatus } from "@prisma/client";
import { getDefaultOrganization } from "@/lib/org/singleton";

export async function loadCompileInput(organizationId: string): Promise<CompileInput> {
  const [groups, environments, rules, settings] = await Promise.all([
    prisma.group.findMany({
      where: { organizationId },
      include: { members: true },
    }),
    prisma.environment.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } }),
    prisma.accessRule.findMany({ where: { organizationId }, include: { group: true, environment: true } }),
    prisma.organizationSettings.findUnique({ where: { organizationId } }),
  ]);

  const adminGroup = groups.find((g) => g.name === "platform-admins");
  const tagOwnersEmails = adminGroup?.members.map((m) => m.email) ?? [];

  return {
    groups: groups.map((g) => ({
      name: g.name,
      memberEmails: g.members.map((m) => m.email),
    })),
    environments: environments.map((e) => ({ tag: e.tag, slug: e.slug })),
    rules: rules.map((r) => ({
      groupName: r.group.name,
      environmentTag: r.environment.tag,
      ports: r.ports,
    })),
    tagOwnersEmails,
  };
}

export async function previewPolicy(authorId: string) {
  const org = await getDefaultOrganization();
  const input = await loadCompileInput(org.id);
  const lint = lintPolicyInput(input);
  const errors = lint.filter((i) => i.level === "error");
  if (errors.length) {
    return { ok: false as const, lint, errors };
  }
  const compiled = compilePolicy(input);
  const snapshot = await prisma.policySnapshot.create({
    data: {
      organizationId: org.id,
      contentHash: compiled.contentHash,
      hujson: compiled.hujson,
      status: PolicySnapshotStatus.PENDING,
      authorId,
    },
  });
  return { ok: true as const, lint, snapshot, compiled };
}

export async function applyPolicy(snapshotId: string, actorId: string) {
  const org = await getDefaultOrganization();
  const snapshot = await prisma.policySnapshot.findFirst({
    where: { id: snapshotId, organizationId: org.id },
  });
  if (!snapshot) throw new Error("Snapshot not found");

  if (isHeadscaleConfigured()) {
    try {
      await putPolicy(snapshot.hujson);
    } catch (e) {
      await prisma.policySnapshot.update({
        where: { id: snapshotId },
        data: {
          status: PolicySnapshotStatus.FAILED,
          errorMessage: e instanceof Error ? e.message : "Apply failed",
        },
      });
      throw e;
    }
  }

  await prisma.policySnapshot.updateMany({
    where: { organizationId: org.id, status: PolicySnapshotStatus.APPLIED },
    data: { status: PolicySnapshotStatus.SUPERSEDED },
  });

  await prisma.policySnapshot.update({
    where: { id: snapshotId },
    data: {
      status: PolicySnapshotStatus.APPLIED,
      appliedAt: new Date(),
    },
  });

  await appendAuditEvent({
    organizationId: org.id,
    actorId,
    action: "policy.applied",
    resourceType: "policy_snapshot",
    resourceId: snapshotId,
    afterJson: { contentHash: snapshot.contentHash },
  });
}

export async function rollbackPolicy(actorId: string) {
  const org = await getDefaultOrganization();
  const previous = await prisma.policySnapshot.findFirst({
    where: {
      organizationId: org.id,
      status: PolicySnapshotStatus.SUPERSEDED,
    },
    orderBy: { appliedAt: "desc" },
  });
  if (!previous) throw new Error("No snapshot to roll back to");
  if (isHeadscaleConfigured()) {
    await putPolicy(previous.hujson);
  }
  await applyPolicy(previous.id, actorId);
}
