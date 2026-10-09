import { AuditCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { appendAuditEvent } from "@/lib/audit/write";
import type { HeadscaleNode } from "@/lib/headscale/client";

export async function syncMachinesFromHeadscale(
  organizationId: string,
  nodes: HeadscaleNode[],
): Promise<void> {
  for (const node of nodes) {
    if (!node.id) continue;
    const existing = await prisma.machine.findUnique({
      where: { headscaleNodeId: node.id },
    });
    const ipAddresses = JSON.stringify(node.addresses ?? []);
    const lastSeenAt = node.lastSeen ? new Date(node.lastSeen) : null;
    const lastOnline = Boolean(node.online);

    if (!existing) {
      const createdById = await inferMachineCreator(organizationId, node.user?.name);
      await prisma.machine.create({
        data: {
          organizationId,
          headscaleNodeId: node.id,
          name: node.name || node.hostname || node.id,
          hostname: node.hostname,
          ipAddresses,
          lastOnline,
          lastSeenAt,
          createdById,
        },
      });
      await appendAuditEvent({
        organizationId,
        action: lastOnline ? "machine.online" : "machine.registered",
        category: AuditCategory.NETWORK,
        resourceType: "machine",
        resourceId: node.id,
        afterJson: { name: node.name, online: lastOnline },
      });
      continue;
    }

    const onlineChanged = existing.lastOnline !== lastOnline;
    const createdById =
      existing.createdById ?? (await inferMachineCreator(organizationId, node.user?.name));
    await prisma.machine.update({
      where: { id: existing.id },
      data: {
        hostname: node.hostname || existing.hostname,
        ipAddresses,
        lastOnline,
        lastSeenAt,
        createdById,
      },
    });
    if (onlineChanged) {
      await appendAuditEvent({
        organizationId,
        action: lastOnline ? "machine.online" : "machine.offline",
        category: AuditCategory.NETWORK,
        resourceType: "machine",
        resourceId: existing.id,
        afterJson: { name: node.name || existing.name, online: lastOnline },
      });
    }
  }
}

async function inferMachineCreator(
  organizationId: string,
  headscaleUser?: string,
): Promise<string | null> {
  const ident = headscaleUser?.trim();
  if (ident) {
    const matched = await prisma.user.findFirst({
      where: { OR: [{ email: ident.toLowerCase() }, { username: ident }] },
      select: { id: true },
    });
    if (matched) return matched.id;
  }
  const event = await prisma.auditEvent.findFirst({
    where: { organizationId, action: "authkey.created", actorId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { actorId: true },
  });
  return event?.actorId ?? null;
}

export function parseIpAddresses(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
  } catch {
    return [];
  }
}

/** Prefer CGNAT IPv4 so reverse proxies do not emit unbracketed IPv6 hosts. */
export function preferMeshIp(addrs: string[]): string | undefined {
  return addrs.find((addr) => addr.length > 0 && !addr.includes(":")) ?? addrs.find((addr) => addr.length > 0);
}
