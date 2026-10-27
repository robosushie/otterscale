import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { AppForm } from "@/components/apps/app-form";
import { AppsTable, type AppRow } from "@/components/apps/apps-table";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { useCapabilities } from "@/hooks/use-capabilities";

export function AppsPage() {
  const ctx = useCapabilities();
  const canManage = ctx.capabilities.includes("network.manage");
  const [baseDomain, setBaseDomain] = useState("apps.localhost");
  const [machines, setMachines] = useState<{ id: string; name: string }[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const load = () => {
    void api.settings().then((org) => setBaseDomain(org.appsBaseDomain || "apps.localhost")).catch(() => undefined);
    void api.machines().then((table) => {
      setMachines(table.rows.map((row) => ({ id: row.machineId, name: row.name })));
      setWorkspaces(table.workspaces);
    }).catch(() => undefined);
    void api.apps().then((rows) =>
      setApps(rows.map((row) => ({
        id: row.id,
        subdomain: row.subdomain,
        port: row.port,
        status: row.status,
        lastError: row.lastError || null,
        machineId: row.machineId,
        machineName: row.machine,
        addedBy: row.addedBy || "—",
        createdById: row.createdById || "",
        workspaces: row.workspaces ?? [],
        workspaceIds: row.workspaceIds ?? [],
      }))),
    ).catch(() => setApps([]));
  };
  useEffect(load, []);
  const selected = workspaceId || workspaces[0]?.id || "";
  const visible = apps.filter((app) => selected !== "" && app.workspaceIds.includes(selected));
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
      <Field label="Workspace" className="mb-4 max-w-xs">
        <Select value={selected} onChange={(event) => setWorkspaceId(event.target.value)}>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </Select>
      </Field>
      <p className="mb-3 text-[12px] text-smoke">{visible.length} {visible.length === 1 ? "app" : "apps"}</p>
      <AppsTable apps={visible} machines={machines} baseDomain={baseDomain} currentUserId={ctx.userId} onDeleted={load} />
    </div>
  );
}
