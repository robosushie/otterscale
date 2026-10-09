"use client";

import { useState, useTransition, type FormEvent } from "react";
import { deleteMachine, updateMachine } from "@/lib/actions/network";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";

export function MachineEditor({
  machineId,
  name,
  addresses,
  lastSeen,
  online,
  selectedWorkspaceIds,
  selectedTagIds,
  workspaces,
  tags,
}: {
  machineId: string;
  name: string;
  addresses: string;
  lastSeen: string;
  online: boolean;
  selectedWorkspaceIds: string[];
  selectedTagIds: string[];
  workspaces: { id: string; name: string }[];
  tags: { id: string; name: string; aclTag: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `machine-${machineId}`;

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateMachine(fd);
      if (!result.ok) setError(result.error);
    });
  }

  function onDelete() {
    if (!confirm(`Delete ${name}? This removes the node from Headscale.`)) return;
    const fd = new FormData();
    fd.set("machineId", machineId);
    startTransition(async () => {
      setError(null);
      const result = await deleteMachine(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-ash align-top">
      <td className="py-3">
        <p className="flex items-center gap-2 font-medium">
          <span
            className={`inline-block h-2 w-2 rounded-full ${online ? "bg-lake-blue" : "bg-ash"}`}
            aria-label={online ? "Online" : "Offline"}
          />
          {name}
        </p>
        <form id={formId} onSubmit={onSave}>
          <input type="hidden" name="machineId" value={machineId} />
          <input type="hidden" name="name" value={name} />
        </form>
        {error ? <p className="mt-2 text-sm text-off-black">{error}</p> : null}
      </td>
      <td className="py-3 tabular-nums">{addresses}</td>
      <td className="py-3">
        <CheckMenu
          form={formId}
          name="workspaceIds"
          placeholder="Workspaces"
          defaultSelected={selectedWorkspaceIds}
          options={workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name }))}
        />
      </td>
      <td className="py-3">
        <CheckMenu
          form={formId}
          name="tagIds"
          placeholder="Tags"
          defaultSelected={selectedTagIds}
          options={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
        />
      </td>
      <td className="py-3 tabular-nums">{lastSeen}</td>
      <td className="py-3">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" form={formId} variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
