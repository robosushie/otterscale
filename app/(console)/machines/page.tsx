import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { formatHeadscaleError, isHeadscaleConfigured, listNodes } from "@/lib/headscale/client";
import { getLoginServerUrl } from "@/lib/headscale/login-server";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { AuthKeyForm } from "@/components/network/auth-key-form";
import { MachineEditor } from "@/components/network/machine-editor";
import { machineVisibleToViewer } from "@/lib/machines/visibility";
import { parseIpAddresses, syncMachinesFromHeadscale } from "@/lib/machines/sync";
import { writeAppsRoutes } from "@/lib/apps/publish";
import { DEFAULT_AUTH_KEY_EXPIRY } from "@/lib/headscale/expiry";

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
    include: { workspaces: true, tags: true },
  });
  const byHsId = new Map(dbMachines.map((m) => [m.headscaleNodeId, m]));

  const visibleNodes = nodes.filter((n) => {
    const row = byHsId.get(n.id);
    return machineVisibleToViewer(row?.workspaces.map((w) => w.groupId) ?? [], authz);
  });

  const unassigned = authz.isPlatformAdmin
    ? dbMachines.filter((m) => m.workspaces.length === 0 && !nodes.some((n) => n.id === m.headscaleNodeId))
    : [];

  return (
    <div>
      <PageHeader
        title="Machines"
        description="Devices on your tailnet. Visibility follows workspace membership. Owner and super admin see every node."
      />

      {!isHeadscaleConfigured() && (
        <Card className="mb-8">
          <p className="text-graphite">
            Set <code>HEADSCALE_INTERNAL_URL</code> and <code>HEADSCALE_API_KEY</code> to load
            devices. Clients still register with the login server on port 8080.
          </p>
        </Card>
      )}

      {headscaleError && (
        <Card className="mb-8">
          <p className="text-off-black">{headscaleError}</p>
        </Card>
      )}

      {canManage && (
        <Card className="mb-8">
          <h2 className="text-[24px]">Add device</h2>
          <p className="mt-2 text-sm text-graphite">
            Pick workspaces (required) and tags (optional), then run both printed commands
            (<code>tailscale logout</code> then <code>tailscale up</code>). Local default login-server is{" "}
            <code>http://127.0.0.1:8080</code>. Set <code>OTTERSCALE_DOMAIN</code> for production HTTPS.
          </p>
          <div className="mt-4">
            <AuthKeyForm
              loginServer={loginServer}
              workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
              tags={tags.map((t) => ({ id: t.id, name: t.name, aclTag: t.aclTag }))}
              defaultExpiry={expiryFromHours(org.settings?.defaultAuthKeyExpiryHours)}
            />
          </div>
        </Card>
      )}

      <p className="mb-3 inline-flex rounded-[9999px] border border-ash px-2 py-1 text-[12px] text-smoke">
        {visibleNodes.length} {visibleNodes.length === 1 ? "machine" : "machines"}
      </p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th className="py-2">Machine</th>
            <th>Addresses</th>
            <th>Workspaces</th>
            <th>Tags</th>
            <th>Last seen</th>
            {canManage ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {visibleNodes.map((n) => {
            const row = byHsId.get(n.id);
            const wsNames = workspaces
              .filter((w) => row?.workspaces.some((mw) => mw.groupId === w.id))
              .map((w) => w.name);
            const tagNames = tags
              .filter((t) => row?.tags.some((mt) => mt.tagId === t.id))
              .map((t) => t.name);
            const addresses =
              n.addresses?.join(", ") || parseIpAddresses(row?.ipAddresses ?? "[]").join(", ") || "—";
            const seen = formatSeen(n.lastSeen);
            if (canManage && row) {
              return (
                <MachineEditor
                  key={n.id}
                  machineId={row.id}
                  name={row.name}
                  addresses={addresses}
                  lastSeen={seen}
                  online={Boolean(n.online)}
                  selectedWorkspaceIds={row.workspaces.map((w) => w.groupId)}
                  selectedTagIds={row.tags.map((t) => t.tagId)}
                  workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
                  tags={tags.map((t) => ({ id: t.id, name: t.name, aclTag: t.aclTag }))}
                />
              );
            }
            return (
              <tr key={n.id} className="border-b border-ash align-top">
                <td className="py-3">
                  <p className="flex items-center gap-2 font-medium">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${n.online ? "bg-lake-blue" : "bg-ash"}`}
                      aria-label={n.online ? "Online" : "Offline"}
                    />
                    {n.name || n.hostname || "—"}
                  </p>
                  {canManage && !row ? (
                    <p className="mt-2 text-sm text-smoke">
                      Node is not in Otterscale yet. Refresh after the next sync, then assign workspaces.
                    </p>
                  ) : null}
                </td>
                <td className="tabular-nums">{addresses}</td>
                <td>{wsNames.join(", ") || "Unassigned"}</td>
                <td>{tagNames.join(", ") || "—"}</td>
                <td className="tabular-nums">{seen}</td>
                {canManage ? <td /> : null}
              </tr>
            );
          })}
          {visibleNodes.length === 0 && (
            <tr>
              <td colSpan={canManage ? 6 : 5} className="py-4 text-smoke">
                No devices in your workspaces yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {unassigned.length > 0 && canManage ? (
        <p className="mt-4 text-sm text-smoke">
          {unassigned.length} stored machine{unassigned.length === 1 ? "" : "s"} with no live Headscale
          node. Assign workspaces after they rejoin.
        </p>
      ) : null}
    </div>
  );
}
