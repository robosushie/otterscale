"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { deleteConsoleUser, updateUserAccess } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { controlClassName } from "@/components/ui/field";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "MEMBER";
  joined: string;
  workspaceIds: string[];
};

export function UsersTable({
  users,
  workspaces,
  canManage,
  canAssignSuperAdmin,
  currentUserId,
}: {
  users: UserRow[];
  workspaces: { id: string; name: string }[];
  canManage: boolean;
  canAssignSuperAdmin: boolean;
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [query, users]);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await updateUserAccess(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingId(null);
    });
  }

  function onDelete(user: UserRow) {
    if (!confirm(`Delete ${user.email}?`)) return;
    const formData = new FormData();
    formData.set("userId", user.id);
    startTransition(async () => {
      setError(null);
      const result = await deleteConsoleUser(formData);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search users…"
        className={`${controlClassName} mt-0 max-w-xl`}
      />
      <p className="mt-4 mb-3 inline-flex rounded-[9999px] border border-ash px-2 py-1 text-[12px] text-smoke">
        {filtered.length} {filtered.length === 1 ? "user" : "users"}
      </p>
      {error ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th className="py-2">User</th>
            <th>Role</th>
            <th>Joined</th>
            {canManage ? <th></th> : null}
          </tr>
        </thead>
        <tbody>
          {filtered.map((user) => {
            const locked =
              user.roleKey === "OWNER" ||
              user.id === currentUserId ||
              (user.roleKey === "SUPER_ADMIN" && !canAssignSuperAdmin);
            const editing = editingId === user.id;
            return (
              <tr key={user.id} className="border-b border-ash align-top">
                <td className="py-3">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-smoke">{user.email}</p>
                  {editing ? (
                    <form id={`user-${user.id}`} onSubmit={onSave} className="mt-3 flex max-w-md flex-col gap-3">
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        className={`${controlClassName} mt-0`}
                        defaultValue={user.roleKey === "SUPER_ADMIN" ? "SUPER_ADMIN" : user.roleKey}
                      >
                        {canAssignSuperAdmin ? <option value="SUPER_ADMIN">Super admin</option> : null}
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                      </select>
                      <CheckMenu
                        name="workspaceIds"
                        placeholder="Workspaces"
                        defaultSelected={user.workspaceIds}
                        options={workspaces.map((workspace) => ({
                          id: workspace.id,
                          label: workspace.name,
                        }))}
                      />
                    </form>
                  ) : null}
                </td>
                <td className="py-3">{user.role}</td>
                <td className="py-3 tabular-nums">{user.joined}</td>
                {canManage ? (
                  <td className="py-3">
                    {locked ? null : editing ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" form={`user-${user.id}`} variant="secondary" disabled={pending}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" disabled={pending} onClick={() => setEditingId(user.id)}>
                          Edit
                        </Button>
                        <Button type="button" variant="ghost" disabled={pending} onClick={() => onDelete(user)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={canManage ? 4 : 3} className="py-4 text-smoke">
                No users match this search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
