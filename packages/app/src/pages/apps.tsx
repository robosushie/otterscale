import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { AppForm } from "@/components/apps/app-form";
import { AppsTable, type AppRow } from "@/components/apps/apps-table";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { useCapabilities } from "@/hooks/use-capabilities";

export function AppsPage() {
  const ctx = useCapabilities();
  const canManage = ctx.capabilities.includes("network.manage");
  const [baseDomain, setBaseDomain] = useState("apps.localhost");
  const [machines, setMachines] = useState<{ id: string; name: string }[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const load = () => {
    void api.settings().then((org) => setBaseDomain(org.appsBaseDomain || "apps.localhost")).catch(() => undefined);
    void api.machines().then((table) => setMachines(table.rows.map((row) => ({ id: row.machineId, name: row.name })))).catch(() => undefined);
    void api.apps().then((rows) =>
      setApps(rows.map((row) => ({
        id: row.id,
        subdomain: row.subdomain,
        port: row.port,
        status: row.status,
        lastError: row.lastError || null,
        machineId: row.machineId,
        machineName: row.machine,
        addedBy: "—",
      }))),
    ).catch(() => setApps([]));
  };
  useEffect(load, []);
  return (
    <div>
      <PageHeader
        title="Apps"
        description="Processes published on mesh machines."
        action={canManage ? (
          <AddPanel buttonLabel="Add app" title="Add app">
            <AppForm machines={machines} baseDomain={baseDomain} onSaved={load} />
          </AddPanel>
        ) : null}
      />
      <p className="mb-3 text-[12px] text-smoke">{apps.length} {apps.length === 1 ? "app" : "apps"}</p>
      <AppsTable apps={apps} machines={machines} baseDomain={baseDomain} canManage={canManage} onDeleted={load} />
    </div>
  );
}
