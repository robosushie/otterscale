import { useCallback, useState, useTransition } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { AppForm } from "@/components/apps/app-form";
import { Button } from "@/components/ui/button";
import { RecordCard, RecordCards } from "@/components/ui/record-card";
import { SidePanel } from "@/components/ui/side-panel";
import { useCapabilities } from "@/hooks/use-capabilities";
import { isSteward } from "@/types/roles";

export type AppRow = {
  id: string;
  subdomain: string;
  port: number;
  status: string;
  lastError: string | null;
  machineId: string;
  machineName: string;
  addedBy: string;
  createdById: string;
  workspaces: string[];
};

export function AppsTable({
  apps,
  machines,
  baseDomain,
  currentUserId,
  onDeleted,
}: {
  apps: AppRow[];
  machines: { id: string; name: string }[];
  baseDomain: string;
  currentUserId: string;
  onDeleted?: () => void;
}) {
  const [editing, setEditing] = useState<AppRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ctx = useCapabilities();
  const steward = isSteward(ctx);
  const canChange = (app: AppRow) => steward || (Boolean(currentUserId) && app.createdById === currentUserId);
  const showActions = apps.some(canChange);
  const close = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  function onDisable(app: AppRow) {
    const next = app.status !== "DISABLED";
    if (!confirm(next ? `Disable ${app.subdomain}? It drops out of the edge routes.` : `Enable ${app.subdomain}?`)) return;
    startTransition(async () => {
      setError(null);
      try {
        await api.setAppDisabled(app.id, next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update the app");
        return;
      }
      onDeleted?.();
    });
  }

  function onDelete(app: AppRow) {
    if (!confirm(`Delete ${app.subdomain}.${baseDomain}?`)) return;
    startTransition(async () => {
      setError(null);
      try {
        await api.deleteApp(app.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
        return;
      }
      onDeleted?.();
    });
  }

  function appActions(app: AppRow) {
    return (
      <div className="cell-end">
        <Button
          type="button"
          variant="secondary"
          icon
          aria-label={`Edit ${app.subdomain}`}
          disabled={pending}
          onClick={() => {
            setError(null);
            setEditing(app);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon
          aria-label={app.status === "DISABLED" ? `Enable ${app.subdomain}` : `Disable ${app.subdomain}`}
          disabled={pending}
          onClick={() => onDisable(app)}
        >
          <Ban className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon
          aria-label={`Delete ${app.subdomain}`}
          disabled={pending}
          onClick={() => onDelete(app)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      {error && !editing ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <RecordCards>
        {apps.map((app) => (
          <RecordCard
            key={app.id}
            title={`${app.subdomain}.${baseDomain}`}
            rows={[
              { label: "Machine", value: app.machineName },
              { label: "Port", value: app.port },
              { label: "Status", value: app.status === "DISABLED" ? "Disabled" : app.lastError ? `${app.status} · ${app.lastError}` : app.status },
              { label: "Workspace", value: app.workspaces.join(", ") || "—" },
              { label: "Added by", value: app.addedBy || "—" },
            ]}
            actions={canChange(app) ? appActions(app) : null}
          />
        ))}
      </RecordCards>
      {apps.length === 0 ? <p className="text-sm text-smoke lg:hidden">No published apps yet.</p> : null}
      <div className="hidden lg:block">
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>URL</th>
            <th>Machine</th>
            <th>Port</th>
            <th>Status</th>
            <th>Workspace</th>
            <th>Added by</th>
            {showActions ? <th className="actions"></th> : null}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id} className="border-b border-ash">
              <td>
                <div className="cell">
                  <a className="link" href={`https://${app.subdomain}.${baseDomain}`} target="_blank" rel="noreferrer">
                    {app.subdomain}.{baseDomain}
                  </a>
                </div>
              </td>
              <td>
                <div className="cell">{app.machineName}</div>
              </td>
              <td>
                <div className="cell tabular-nums">{app.port}</div>
              </td>
              <td>
                <div className="cell-stack">
                  <span>{app.status}</span>
                  {app.lastError ? <span className="text-smoke">{app.lastError}</span> : null}
                </div>
              </td>
              <td>
                <div className="cell">{app.workspaces.join(", ") || "—"}</div>
              </td>
              <td>
                <div className="cell">{app.addedBy}</div>
              </td>
              {showActions ? (
                <td className="actions">
                  {canChange(app) ? (
                  appActions(app)
                  ) : (
                    <div className="cell-end" />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {apps.length === 0 ? (
            <tr>
              <td colSpan={showActions ? 7 : 6}>
                <div className="cell text-smoke">No published apps yet.</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>

      <SidePanel open={Boolean(editing)} title={editing ? `Edit ${editing.subdomain}` : "Edit app"} onClose={close}>
        {editing ? (
          <AppForm
            key={editing.id}
            machines={machines}
            baseDomain={baseDomain}
            initial={{
              appId: editing.id,
              machineId: editing.machineId,
              port: editing.port,
              subdomain: editing.subdomain,
            }}
            submitLabel="Save"
            onSaved={close}
          />
        ) : null}
      </SidePanel>
    </>
  );
}
