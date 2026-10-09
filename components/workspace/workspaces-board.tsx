"use client";

import { useState } from "react";
import { addGroupMemberForm, createGroupForm } from "@/lib/actions/workspace";
import { AddPanel, SidePanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type WorkspaceRow = {
  id: string;
  name: string;
  members: string[];
};

export function WorkspacesBoard({ workspaces }: { workspaces: WorkspaceRow[] }) {
  const [memberFor, setMemberFor] = useState<WorkspaceRow | null>(null);

  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="Isolation groups for people and devices."
        action={
          <AddPanel buttonLabel="Add workspace" title="Add workspace">
            <form action={createGroupForm} className="flex flex-col gap-4">
              <Field label="Name">
                <Input name="name" placeholder="Workspace name" required />
              </Field>
              <Button type="submit">Add workspace</Button>
            </form>
          </AddPanel>
        }
      />

      <p className="mb-3 text-[12px] text-smoke">
        {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}
      </p>
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Name</th>
            <th>Members</th>
            <th>People</th>
            <th className="actions"></th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => (
            <tr key={workspace.id} className="border-b border-ash">
              <td>
                <div className="cell font-medium">{workspace.name}</div>
              </td>
              <td>
                <div className="cell tabular-nums">{workspace.members.length}</div>
              </td>
              <td>
                <div className="cell">{workspace.members.join(", ") || "—"}</div>
              </td>
              <td className="actions">
                <div className="cell-end">
                  <Button type="button" variant="ghost" onClick={() => setMemberFor(workspace)}>
                    Add member
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {workspaces.length === 0 ? (
            <tr>
              <td colSpan={4}>
                <div className="cell text-smoke">No workspaces yet.</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <SidePanel
        open={Boolean(memberFor)}
        title={memberFor ? `Add member · ${memberFor.name}` : "Add member"}
        onClose={() => setMemberFor(null)}
      >
        {memberFor ? (
          <form action={addGroupMemberForm} className="flex flex-col gap-4">
            <input type="hidden" name="groupId" value={memberFor.id} />
            <Field label="Email">
              <Input name="email" type="email" placeholder="member@example.com" required />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Button type="submit">Add member</Button>
          </form>
        ) : null}
      </SidePanel>
    </div>
  );
}
