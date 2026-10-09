import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { AppForm } from "@/components/apps/app-form";
import { deleteAppForm } from "@/lib/actions/apps";
import { machineVisibleToViewer } from "@/lib/machines/visibility";

export default async function AppsPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "network.view")) redirect("/signin");

  const org = await getDefaultOrganization();
  const canManage = hasCapability(authz.capabilities, "network.manage");
  const baseDomain = org.settings?.appsBaseDomain || "apps.localhost";

  const [machines, apps] = await Promise.all([
    prisma.machine.findMany({
      where: { organizationId: org.id },
      include: { workspaces: true },
      orderBy: { name: "asc" },
    }),
    prisma.publishedApp.findMany({
      where: { organizationId: org.id },
      include: { machine: { include: { workspaces: true } } },
      orderBy: { subdomain: "asc" },
    }),
  ]);

  const visibleMachines = machines.filter((m) =>
    machineVisibleToViewer(
      m.workspaces.map((w) => w.groupId),
      authz,
    ),
  );
  const visibleApps = apps.filter((app) =>
    machineVisibleToViewer(
      app.machine.workspaces.map((w) => w.groupId),
      authz,
    ),
  );

  return (
    <div>
      <PageHeader
        title="Apps"
        description={`Publish a process on a mesh machine. The proxy reverse-proxies https://{subdomain}.${baseDomain} onto that node IP and port. This is not Funnel.`}
      />

      {canManage ? (
        <Card className="mb-8">
          <h2 className="text-[24px]">Publish an app</h2>
          <p className="mt-2 text-sm text-graphite">
            The mesh proxy probes <code>{"{nodeIP}:{port}"}</code> at save time. Bind the process to
            0.0.0.0 or the Tailscale IP, not localhost. Chrome resolves <code>*.apps.localhost</code>
            ; Windows hosts files may need each name.
          </p>
          <AppForm
            machines={visibleMachines.map((m) => ({ id: m.id, name: m.name }))}
            baseDomain={baseDomain}
          />
        </Card>
      ) : null}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th className="py-2">URL</th>
            <th>Machine</th>
            <th>Port</th>
            <th>Status</th>
            {canManage ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {visibleApps.map((app) => (
            <tr key={app.id} className="border-b border-ash">
              <td className="py-3">
                <a className="link" href={`https://${app.subdomain}.${baseDomain}`}>
                  {app.subdomain}.{baseDomain}
                </a>
              </td>
              <td>{app.machine.name}</td>
              <td className="tabular-nums">{app.port}</td>
              <td>
                {app.status}
                {app.lastError ? <p className="text-smoke">{app.lastError}</p> : null}
              </td>
              {canManage ? (
                <td>
                  <form action={deleteAppForm}>
                    <input type="hidden" name="appId" value={app.id} />
                    <Button type="submit" variant="ghost" className="!min-h-0 text-sm">
                      Remove
                    </Button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
          {visibleApps.length === 0 && (
            <tr>
              <td colSpan={canManage ? 5 : 4} className="py-4 text-smoke">
                No published apps yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
