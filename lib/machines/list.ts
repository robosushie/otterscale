import { prisma } from "@/lib/db";
import { formatPerson } from "@/lib/console/person";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { hasCapability } from "@/lib/authz/permissions";
import { formatHeadscaleError, isHeadscaleConfigured, listNodes } from "@/lib/headscale/client";
import { isEdgeMachine } from "@/lib/machines/edge";
import { machineVisibleToViewer } from "@/lib/machines/visibility";
import { parseIpAddresses, syncMachinesFromHeadscale } from "@/lib/machines/sync";
import { writeAppsRoutes } from "@/lib/apps/publish";
import type { MachineRow } from "@/lib/machines/rows";
import type { UserCapabilities } from "@/types/roles";

export type MachinesTableData = {
  rows: MachineRow[];
  unassigned: number;
  headscaleError: string | null;
  configured: boolean;
  canManage: boolean;
  workspaces: { id: string; name: string }[];
  tags: { id: string; name: string; aclTag: string }[];
};

function formatSeen(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export async function buildMachinesTable(authz: UserCapabilities): Promise<MachinesTableData> {
  const org = await getDefaultOrganization();
  const [tags, workspaces] = await Promise.all([
    prisma.tag.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.group.findMany({
      where: authz.isPlatformAdmin ? { organizationId: org.id } : { id: { in: authz.workspaceIds } },
      orderBy: { name: "asc" },
    }),
  ]);
  const assignableTags = tags.filter((tag) => tag.aclTag !== "tag:edge" && tag.name.toLowerCase() !== "edge");
  const canManage = hasCapability(authz.capabilities, "network.manage");
  const configured = isHeadscaleConfigured();

  let nodes: Awaited<ReturnType<typeof listNodes>> = [];
  let headscaleError: string | null = null;
  if (configured) {
    try {
      nodes = await listNodes();
      await syncMachinesFromHeadscale(org.id, nodes);
      await writeAppsRoutes(org.id);
    } catch (error) {
      headscaleError = formatHeadscaleError(error);
    }
  }

  const dbMachines = await prisma.machine.findMany({
    where: { organizationId: org.id },
    include: {
      workspaces: true,
      tags: { include: { tag: true } },
      createdBy: { select: { name: true, username: true, email: true } },
    },
  });
  const byHsId = new Map(dbMachines.map((machine) => [machine.headscaleNodeId, machine]));

  const visibleNodes = nodes.filter((node) => {
    if (isEdgeMachine({ name: node.name, hostname: node.hostname, tags: node.tags })) return false;
    const row = byHsId.get(node.id);
    if (
      row &&
      isEdgeMachine({
        name: row.name,
        hostname: row.hostname,
        tags: row.tags.map((tag) => tag.tag.aclTag),
      })
    ) {
      return false;
    }
    return machineVisibleToViewer(row?.workspaces.map((workspace) => workspace.groupId) ?? [], authz);
  });

  const unassigned = authz.isPlatformAdmin
    ? dbMachines.filter(
        (machine) =>
          !isEdgeMachine({
            name: machine.name,
            hostname: machine.hostname,
            tags: machine.tags.map((tag) => tag.tag.aclTag),
          }) &&
          machine.workspaces.length === 0 &&
          !nodes.some((node) => node.id === machine.headscaleNodeId),
      ).length
    : 0;

  const rows = visibleNodes.flatMap((node) => {
    const row = byHsId.get(node.id);
    if (!row) return [];
    return [
      {
        machineId: row.id,
        name: row.name,
        addresses: node.addresses?.join(", ") || parseIpAddresses(row.ipAddresses ?? "[]").join(", ") || "—",
        lastSeen: formatSeen(node.lastSeen),
        online: Boolean(node.online),
        workspaceNames: workspaces
          .filter((workspace) => row.workspaces.some((link) => link.groupId === workspace.id))
          .map((workspace) => workspace.name),
        tagNames: tags.filter((tag) => row.tags.some((link) => link.tagId === tag.id)).map((tag) => tag.name),
        selectedWorkspaceIds: row.workspaces.map((workspace) => workspace.groupId),
        selectedTagIds: row.tags.map((tag) => tag.tagId),
        addedBy: formatPerson(row.createdBy),
      },
    ];
  });

  return {
    rows,
    unassigned,
    headscaleError,
    configured,
    canManage,
    workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
    tags: assignableTags.map((tag) => ({ id: tag.id, name: tag.name, aclTag: tag.aclTag })),
  };
}
