import { useEffect, useState } from "react";
import { api, type MachinesTable } from "@/api/client";
import { AuthKeyForm } from "@/components/network/auth-key-form";
import { MachinesLive } from "@/components/network/machines-live";
import { Field, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";

function expiryFromHours(hours: number | null | undefined) {
  if (!hours || hours === 24) return "24 hours";
  if (hours === 1) return "1 hour";
  if (hours === 168) return "7 days";
  if (hours === 2160) return "90 days";
  return `${hours}h`;
}

export function MachinesPage() {
  const [table, setTable] = useState<MachinesTable | null>(null);
  const [expiry, setExpiry] = useState("24 hours");
  const [workspaceId, setWorkspaceId] = useState("");
  useEffect(() => {
    void api.machines().then(setTable).catch(() => setTable(null));
    void api.settings().then((org) => setExpiry(expiryFromHours(org.defaultAuthKeyExpiryHours))).catch(() => undefined);
  }, []);
  if (!table) return <p className="text-sm text-smoke">Loading…</p>;
  const selected = workspaceId || table.workspaces[0]?.id || "";
  return (
    <div>
      <PageHeader
        title="Machines"
        description="Devices on your tailnet."
        action={
          table.canManage ? (
            <AddPanel buttonLabel="Add machine" title="Add machine">
              <AuthKeyForm
                loginServer={table.loginServer}
                workspaces={table.workspaces}
                tags={table.tags}
                defaultExpiry={expiry}
              />
            </AddPanel>
          ) : null
        }
      />
      {!table.configured ? (
        <p className="mb-4 text-sm text-smoke">Set HEADSCALE_INTERNAL_URL and HEADSCALE_API_KEY to load devices.</p>
      ) : null}
      <Field label="Workspace" className="mb-4 max-w-xs">
        <Select value={selected} onChange={(event) => setWorkspaceId(event.target.value)}>
          {table.workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
          ))}
        </Select>
      </Field>
      <MachinesLive initial={table} workspaceId={selected} />
    </div>
  );
}
