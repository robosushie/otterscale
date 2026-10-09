import { prisma } from "@/lib/db";
import { compilePolicy, type CompileInput } from "@/lib/policy/compiler";
import { lintPolicyInput } from "@/lib/policy/lint";
import { putPolicy, isHeadscaleConfigured } from "@/lib/headscale/client";
import { appendAuditEvent } from "@/lib/audit/write";
import { PolicySnapshotStatus } from "@prisma/client";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { workspaceTagName } from "@/lib/console/user-role";
import { parseIpAddresses, preferMeshIp } from "@/lib/machines/sync";

const EDGE_TAG = "tag:edge";

export async function loadCompileInput(organizationId: string): Promise<CompileInput> {
  const [groups, tags, rules, apps, platformAdmins] = await Promise.all([
    prisma.group.findMany({
      where: { organizationId },
      include: {
        members: true,
        memberships: { include: { user: { select: { email: true } } } },
      },
    }),
    prisma.tag.findMany({ where: { organizationId } }),
    prisma.accessRule.findMany({ where: { organizationId }, include: { group: true, tag: true } }),
    prisma.publishedApp.findMany({
      where: { organizationId },
      include: { machine: true },
    }),
    prisma.platformMembership.findMany({ include: { user: { select: { email: true } } } }),
  ]);

  const adminGroup = groups.find((g) => g.name === "platform-admins");
  const platformEmails = platformAdmins.map((m) => m.user.email);
  const tagOwnersEmails = [...new Set([...(adminGroup?.members.map((m) => m.email) ?? []), ...platformEmails])];

  return {
    workspaces: groups.map((g) => {
      const fromMemberships = g.memberships.map((m) => m.user.email);
      const fromMembers = g.members.map((m) => m.email);
      return {
        name: g.name,
        memberEmails: [...new Set([...fromMemberships, ...fromMembers, ...platformEmails])],
        workspaceTag: workspaceTagName(g.name),
      };
    }),
    tags: tags.map((t) => ({ aclTag: t.aclTag })),
    extraRules: rules
      .filter((r) => r.tag)
      .map((r) => ({
        srcGroup: r.group.name,
        destTag: r.tag!.aclTag,
        ports: r.ports,
      })),
    tagOwnersEmails,
    edgeTag: EDGE_TAG,
    appDestinations: apps.flatMap((app) => {
      const ip = preferMeshIp(parseIpAddresses(app.machine.ipAddresses));
      if (!ip) return [];
      return [{ dest: `${ip}:${app.port}` }];
    }),
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

export async function compileAndApply(actorId: string) {
  const preview = await previewPolicy(actorId);
  if (!preview.ok) return preview;
  await applyPolicy(preview.snapshot.id, actorId);
  return preview;
}
