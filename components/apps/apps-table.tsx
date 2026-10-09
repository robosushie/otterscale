"use client";

import { useCallback, useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { deleteApp } from "@/lib/actions/apps";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { AppForm } from "@/components/apps/app-form";

export type AppRow = {
  id: string;
  subdomain: string;
  port: number;
  status: string;
  lastError: string | null;
  machineId: string;
  machineName: string;
  addedBy: string;
};

export function AppsTable({
  apps,
  machines,
  baseDomain,
  canManage,
}: {
  apps: AppRow[];
  machines: { id: string; name: string }[];
  baseDomain: string;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<AppRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  function onDelete(app: AppRow) {
    if (!confirm(`Remove ${app.subdomain}.${baseDomain}?`)) return;
    const fd = new FormData();
    fd.set("appId", app.id);
    startTransition(async () => {
      setError(null);
      const result = await deleteApp(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      {error && !editing ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>URL</th>
            <th>Machine</th>
            <th>Port</th>
            <th>Status</th>
            <th>Added by</th>
            {canManage ? <th className="actions"></th> : null}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id} className="border-b border-ash">
              <td>
                <div className="cell">
                  <a className="link" href={`https://${app.subdomain}.${baseDomain}`}>
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
                <div className="cell">{app.addedBy}</div>
              </td>
              {canManage ? (
                <td className="actions">
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
                      aria-label={`Remove ${app.subdomain}`}
                      disabled={pending}
                      onClick={() => onDelete(app)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
          {apps.length === 0 ? (
            <tr>
              <td colSpan={canManage ? 6 : 5}>
                <div className="cell text-smoke">No published apps yet.</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

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
