import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { AppForm } from "@/components/apps/app-form";
import { AppsTable } from "@/components/apps/apps-table";
import { isEdgeMachine } from "@/lib/machines/edge";
import { machineVisibleToViewer } from "@/lib/machines/visibility";
import { formatPerson } from "@/lib/console/person";

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
      include: { workspaces: true, tags: { include: { tag: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.publishedApp.findMany({
      where: { organizationId: org.id },
      include: {
        createdBy: { select: { name: true, username: true, email: true } },
        machine: { include: { workspaces: true, tags: { include: { tag: true } } } },
      },
      orderBy: { subdomain: "asc" },
    }),
  ]);

  const listedMachines = machines.filter((m) => {
    if (isEdgeMachine({ name: m.name, hostname: m.hostname, tags: m.tags.map((t) => t.tag.aclTag) })) {
      return false;
    }
    return machineVisibleToViewer(
      m.workspaces.map((w) => w.groupId),
      authz,
    );
  });
  const visibleApps = apps.filter((app) => {
    if (
      isEdgeMachine({
        name: app.machine.name,
        hostname: app.machine.hostname,
        tags: app.machine.tags.map((t) => t.tag.aclTag),
      })
    ) {
      return false;
    }
    return machineVisibleToViewer(
      app.machine.workspaces.map((w) => w.groupId),
      authz,
    );
  });

  return (
    <div>
      <PageHeader
        title="Apps"
        description="Processes published on mesh machines."
        action={
          canManage ? (
            <AddPanel buttonLabel="Add app" title="Add app">
              <AppForm
                machines={listedMachines.map((m) => ({ id: m.id, name: m.name }))}
                baseDomain={baseDomain}
              />
            </AddPanel>
          ) : null
        }
      />

      <p className="mb-3 text-[12px] text-smoke">
        {visibleApps.length} {visibleApps.length === 1 ? "app" : "apps"}
      </p>
      <AppsTable
        apps={visibleApps.map((app) => ({
          id: app.id,
          subdomain: app.subdomain,
          port: app.port,
          status: app.status,
          lastError: app.lastError,
          machineId: app.machineId,
          machineName: app.machine.name,
          addedBy: formatPerson(app.createdBy),
        }))}
        machines={listedMachines.map((m) => ({ id: m.id, name: m.name }))}
        baseDomain={baseDomain}
        canManage={canManage}
      />
    </div>
  );
}
