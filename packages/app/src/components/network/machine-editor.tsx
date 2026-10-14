import { useCallback, useState, useTransition, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { api, type MachineRow } from "@/api/client";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { Field, Input } from "@/components/ui/field";
import { SidePanel } from "@/components/ui/side-panel";

export type { MachineRow } from "@/api/client";

export function MachinesTable({
  rows,
  workspaces,
  tags,
  currentUserId,
  onMutated,
}: {
  rows: MachineRow[];
  workspaces: { id: string; name: string }[];
  tags: { id: string; name: string; aclTag: string }[];
  currentUserId: string;
  onMutated?: () => void;
}) {
  const [editing, setEditing] = useState<MachineRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canEdit = (row: MachineRow) => Boolean(currentUserId) && row.createdById === currentUserId;
  const showActions = rows.some(canEdit);
  const close = useCallback(() => {
    setEditing(null);
    setError(null);
  }, []);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      try {
        await api.updateMachine(String(fd.get("machineId")), {
          name: String(fd.get("name") ?? ""),
          workspaceIds: fd.getAll("workspaceIds").map(String),
          tagIds: fd.getAll("tagIds").map(String),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
        return;
      }
      close();
      onMutated?.();
    });
  }

  function onDelete(row: MachineRow) {
    if (!confirm(`Delete ${row.name}? This removes the node from Headscale.`)) return;
    const fd = new FormData();
    fd.set("machineId", row.machineId);
    startTransition(async () => {
      setError(null);
      try {
        await api.deleteMachine(row.machineId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
        return;
      }
      onMutated?.();
    });
  }

  return (
    <>
      {error && !editing ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Machine</th>
            <th>Addresses</th>
            <th>Workspaces</th>
            <th>Tags</th>
            <th>Added by</th>
            <th>Last seen</th>
            {showActions ? <th className="actions"></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.machineId} className="border-b border-ash">
              <td>
                <div className="cell gap-2">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${row.online ? "bg-lake-blue" : "bg-ash"}`}
                    aria-label={row.online ? "Online" : "Offline"}
                  />
                  <span className="font-medium">{row.name}</span>
                </div>
              </td>
              <td>
                <div className="cell tabular-nums">{row.addresses}</div>
              </td>
              <td>
                <div className="cell">{row.workspaceNames.join(", ") || "Unassigned"}</div>
              </td>
              <td>
                <div className="cell">{row.tagNames.join(", ") || "—"}</div>
              </td>
              <td>
                <div className="cell">{row.addedBy}</div>
              </td>
              <td>
                <div className="cell tabular-nums">{row.lastSeen}</div>
              </td>
              {showActions ? (
                <td className="actions">
                  {canEdit(row) ? (
                  <div className="cell-end">
                    <Button
                      type="button"
                      variant="secondary"
                      icon
                      aria-label={`Edit ${row.name}`}
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        setEditing(row);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      icon
                      aria-label={`Delete ${row.name}`}
                      disabled={pending}
                      onClick={() => onDelete(row)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  ) : (
                    <div className="cell-end" />
                  )}
                </td>
              ) : null}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={showActions ? 7 : 6} className="text-smoke">
                <div className="cell text-smoke">No devices in your workspaces yet.</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <SidePanel open={Boolean(editing)} title={editing ? `Edit ${editing.name}` : "Edit machine"} onClose={close}>
        {editing ? (
          <form className="flex flex-col gap-4" onSubmit={onSave}>
            <input type="hidden" name="machineId" value={editing.machineId} />
            <Field label="Name">
              <Input name="name" required defaultValue={editing.name} autoComplete="off" />
            </Field>
            <div className="flex flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
              <span>Workspaces</span>
              <CheckMenu
                key={`${editing.machineId}-ws`}
                name="workspaceIds"
                placeholder="Select workspaces"
                defaultSelected={editing.selectedWorkspaceIds}
                options={workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name }))}
              />
            </div>
            <div className="flex flex-col gap-1 text-[12px] font-medium uppercase tracking-[-0.4px] text-off-black">
              <span>Tags</span>
              <CheckMenu
                key={`${editing.machineId}-tags`}
                name="tagIds"
                placeholder="Select tags"
                defaultSelected={editing.selectedTagIds}
                options={tags.map((tag) => ({ id: tag.id, label: `${tag.name} (${tag.aclTag})` }))}
              />
            </div>
            {error ? <p className="text-sm text-off-black">{error}</p> : null}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </form>
        ) : null}
      </SidePanel>
    </>
  );
}
