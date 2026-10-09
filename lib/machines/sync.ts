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
      await prisma.machine.create({
        data: {
          organizationId,
          headscaleNodeId: node.id,
          name: node.name || node.hostname || node.id,
          hostname: node.hostname,
          ipAddresses,
          lastOnline,
          lastSeenAt,
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
    await prisma.machine.update({
      where: { id: existing.id },
      data: {
        name: node.name || existing.name,
        hostname: node.hostname || existing.hostname,
        ipAddresses,
        lastOnline,
        lastSeenAt,
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
