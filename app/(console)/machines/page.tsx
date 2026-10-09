import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatHeadscaleError, isHeadscaleConfigured, listNodes } from "@/lib/headscale/client";
import { getLoginServerUrl } from "@/lib/headscale/login-server";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { AuthKeyForm } from "@/components/network/auth-key-form";
import { MachinesTable } from "@/components/network/machine-editor";
import { isEdgeMachine } from "@/lib/machines/edge";
import { machineVisibleToViewer } from "@/lib/machines/visibility";
import { parseIpAddresses, syncMachinesFromHeadscale } from "@/lib/machines/sync";
import { writeAppsRoutes } from "@/lib/apps/publish";
import { DEFAULT_AUTH_KEY_EXPIRY } from "@/lib/headscale/expiry";
import { formatPerson } from "@/lib/console/person";

function formatSeen(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function expiryFromHours(hours: number | null | undefined): string {
  if (!hours || hours === 24) return DEFAULT_AUTH_KEY_EXPIRY;
  if (hours === 1) return "1 hour";
  if (hours === 168) return "7 days";
  if (hours === 2160) return "90 days";
  return `${hours}h`;
}

export default async function MachinesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "network.view")) redirect("/signin");

  const org = await getDefaultOrganization();
  const [tags, workspaces] = await Promise.all([
    prisma.tag.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.group.findMany({
      where: authz.isPlatformAdmin ? { organizationId: org.id } : { id: { in: authz.workspaceIds } },
      orderBy: { name: "asc" },
    }),
  ]);
  const assignableTags = tags.filter((t) => t.aclTag !== "tag:edge" && t.name.toLowerCase() !== "edge");
  const loginServer = getLoginServerUrl();
  const canManage = hasCapability(authz.capabilities, "network.manage");

  let nodes: Awaited<ReturnType<typeof listNodes>> = [];
  let headscaleError: string | null = null;
  if (isHeadscaleConfigured()) {
    try {
      nodes = await listNodes();
      await syncMachinesFromHeadscale(org.id, nodes);
      await writeAppsRoutes(org.id);
    } catch (e) {
      headscaleError = formatHeadscaleError(e);
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
  const byHsId = new Map(dbMachines.map((m) => [m.headscaleNodeId, m]));

  const visibleNodes = nodes.filter((n) => {
    if (isEdgeMachine({ name: n.name, hostname: n.hostname, tags: n.tags })) return false;
    const row = byHsId.get(n.id);
    if (
      row &&
      isEdgeMachine({
        name: row.name,
        hostname: row.hostname,
        tags: row.tags.map((t) => t.tag.aclTag),
      })
    ) {
      return false;
    }
    return machineVisibleToViewer(row?.workspaces.map((w) => w.groupId) ?? [], authz);
  });

  const unassigned = authz.isPlatformAdmin
    ? dbMachines.filter(
        (m) =>
          !isEdgeMachine({
            name: m.name,
            hostname: m.hostname,
            tags: m.tags.map((t) => t.tag.aclTag),
          }) &&
          m.workspaces.length === 0 &&
          !nodes.some((n) => n.id === m.headscaleNodeId),
      )
    : [];

  const rows = visibleNodes.flatMap((n) => {
    const row = byHsId.get(n.id);
    if (!row) return [];
    return [
      {
        machineId: row.id,
        name: row.name,
        addresses: n.addresses?.join(", ") || parseIpAddresses(row.ipAddresses ?? "[]").join(", ") || "—",
        lastSeen: formatSeen(n.lastSeen),
        online: Boolean(n.online),
        workspaceNames: workspaces
          .filter((w) => row.workspaces.some((mw) => mw.groupId === w.id))
          .map((w) => w.name),
        tagNames: tags.filter((t) => row.tags.some((mt) => mt.tagId === t.id)).map((t) => t.name),
        selectedWorkspaceIds: row.workspaces.map((w) => w.groupId),
        selectedTagIds: row.tags.map((t) => t.tagId),
        addedBy: formatPerson(row.createdBy),
      },
    ];
  });

  return (
    <div>
      <PageHeader
        title="Machines"
        description="Devices on your tailnet."
        action={
          canManage ? (
            <AddPanel buttonLabel="Add machine" title="Add machine">
              <AuthKeyForm
                loginServer={loginServer}
                workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
                tags={assignableTags.map((t) => ({ id: t.id, name: t.name, aclTag: t.aclTag }))}
                defaultExpiry={expiryFromHours(org.settings?.defaultAuthKeyExpiryHours)}
              />
            </AddPanel>
          ) : null
        }
      />

      {!isHeadscaleConfigured() ? (
        <p className="mb-4 text-sm text-smoke">
          Set HEADSCALE_INTERNAL_URL and HEADSCALE_API_KEY to load devices.
        </p>
      ) : null}

      {headscaleError ? <p className="mb-4 text-sm text-off-black">{headscaleError}</p> : null}

      <p className="mb-3 text-[12px] text-smoke">
        {rows.length} {rows.length === 1 ? "machine" : "machines"}
      </p>
      <MachinesTable
        rows={rows}
        canManage={canManage}
        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
        tags={assignableTags.map((t) => ({ id: t.id, name: t.name, aclTag: t.aclTag }))}
      />
      {unassigned.length > 0 && canManage ? (
        <p className="mt-4 text-sm text-smoke">
          {unassigned.length} stored machine{unassigned.length === 1 ? "" : "s"} with no live Headscale
          node. Assign workspaces after they rejoin.
        </p>
      ) : null}
    </div>
  );
}
