import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Ban, Pencil, Save, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { CheckMenu } from "@/components/ui/check-menu";
import { controlClassName } from "@/components/ui/field";
import { RecordCard, RecordCards } from "@/components/ui/record-card";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleKey: "OWNER" | "SUPER_ADMIN" | "ADMIN" | "MEMBER";
  joined: string;
  workspaceIds: string[];
  workspaces: string[];
  loginDisabled?: boolean;
  pending?: boolean;
};

export function UsersTable({
  users,
  workspaces,
  canManage,
  canAssignSuperAdmin,
  currentUserId,
  onChanged,
}: {
  users: UserRow[];
  workspaces: { id: string; name: string }[];
  canManage: boolean;
  canAssignSuperAdmin: boolean;
  currentUserId: string;
  onChanged?: () => void;
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
        u.role.toLowerCase().includes(q) ||
        u.joined.toLowerCase().includes(q) ||
        u.workspaces.some((name) => name.toLowerCase().includes(q)) ||
        (u.loginDisabled && "disabled".includes(q)),
    );
  }, [query, users]);

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      try {
        const userId = String(formData.get("userId"));
        const workspaceIds = formData.getAll("workspaceIds").map(String);
        const pending = formData.get("pending") === "1";
        if (pending) {
          await api.updateInvite(userId, workspaceIds);
        } else {
          await api.updateUser(userId, {
            role: String(formData.get("role") ?? "MEMBER"),
            workspaceIds,
          });
        }
        setEditingId(null);
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  function onRevoke(user: UserRow) {
    if (!confirm(`Revoke the invite for ${user.email}?`)) return;
    startTransition(async () => {
      setError(null);
      try {
        await api.revokeInvite(user.id);
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not revoke");
      }
    });
  }

  function onDisable(user: UserRow) {
    const next = !user.loginDisabled;
    if (!confirm(next ? `Disable login for ${user.email}?` : `Enable login for ${user.email}?`)) return;
    startTransition(async () => {
      setError(null);
      try {
        await api.setUserDisabled(user.id, next);
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update access");
      }
    });
  }

  function onDelete(user: UserRow) {
    if (!confirm(`Delete ${user.email}?`)) return;
    const formData = new FormData();
    formData.set("userId", user.id);
    startTransition(async () => {
      setError(null);
      try {
        await api.deleteUser(user.id);
        onChanged?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
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
      <p className="mt-4 mb-3 text-[12px] text-smoke">
        {filtered.length} {filtered.length === 1 ? "user" : "users"}
      </p>
      {error ? <p className="mb-3 text-sm text-off-black">{error}</p> : null}
      <RecordCards>
        {filtered.map((user) => {
          const editing = editingId === user.id;
          return (
            <RecordCard
              key={user.id}
              title={user.name}
              rows={[
                { label: "Email", value: user.email },
                { label: "Role", value: user.loginDisabled ? `${user.role} · Disabled` : user.role },
                { label: "Workspaces", value: user.workspaces.join(", ") || "—" },
                { label: "Joined", value: user.joined },
              ]}
              actions={userActions(user, "card")}
            >
              {editing ? userForm(user, "card") : null}
            </RecordCard>
          );
        })}
      </RecordCards>
      {filtered.length === 0 ? <p className="text-sm text-smoke lg:hidden">No users match this search.</p> : null}
      <div className="hidden lg:block">
        <table className="console-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ash">
              <th>User</th>
              <th>Role</th>
              <th>Workspaces</th>
              <th>Joined</th>
              {canManage ? <th className="actions"></th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const editing = editingId === user.id;
              return (
                <tr key={user.id} className="border-b border-ash">
                  <td>
                    <div className="cell-stack">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-smoke">{user.email}</p>
                      {editing ? userForm(user, "table") : null}
                    </div>
                  </td>
                  <td>
                    <div className="cell">{user.loginDisabled ? `${user.role} · Disabled` : user.role}</div>
                  </td>
                  <td>
                    <div className="cell">{user.workspaces.join(", ") || "—"}</div>
                  </td>
                  <td>
                    <div className="cell tabular-nums">{user.joined}</div>
                  </td>
                  {canManage ? <td className="actions">{userActions(user, "table")}</td> : null}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4}>
                  <div className="cell text-smoke">No users match this search.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  function userForm(user: UserRow, layout: "card" | "table") {
    return (
      <form id={`user-${user.id}-${layout}`} onSubmit={onSave} className="mt-3 flex max-w-md flex-col gap-3">
        <input type="hidden" name="userId" value={user.id} />
        {user.pending ? <input type="hidden" name="pending" value="1" /> : null}
        {user.pending ? null : (
          <select
            name="role"
            className={`${controlClassName} mt-0`}
            defaultValue={user.roleKey === "SUPER_ADMIN" ? "SUPER_ADMIN" : user.roleKey}
          >
            {canAssignSuperAdmin ? <option value="SUPER_ADMIN">Super admin</option> : null}
            <option value="ADMIN">Admin</option>
            <option value="MEMBER">Member</option>
          </select>
        )}
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
    );
  }

  function userActions(user: UserRow, layout: "card" | "table") {
    if (!canManage) return null;
    const locked =
      user.roleKey === "OWNER" ||
      user.id === currentUserId ||
      (user.roleKey === "SUPER_ADMIN" && !canAssignSuperAdmin);
    const editing = editingId === user.id;
    if (user.pending) {
      return editing ? (
        <div className="cell-end">
          <Button type="submit" form={`user-${user.id}-${layout}`} variant="secondary" icon aria-label={`Save ${user.name}`} disabled={pending}>
            <Save className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditingId(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="cell-end">
          <Button type="button" variant="secondary" icon aria-label={`Edit ${user.name}`} disabled={pending} onClick={() => setEditingId(user.id)}>
            <Pencil className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" icon aria-label={`Remove invite for ${user.email}`} disabled={pending} onClick={() => onRevoke(user)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      );
    }
    if (locked) return <div className="cell-end" />;
    if (editing) {
      return (
        <div className="cell-end">
          <Button type="submit" form={`user-${user.id}-${layout}`} variant="secondary" icon aria-label={`Save ${user.name}`} disabled={pending}>
            <Save className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditingId(null)}>
            Cancel
          </Button>
        </div>
      );
    }
    return (
      <div className="cell-end">
        <Button type="button" variant="secondary" icon aria-label={`Edit ${user.name}`} disabled={pending} onClick={() => setEditingId(user.id)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon
          aria-label={user.loginDisabled ? `Enable ${user.email}` : `Disable ${user.email}`}
          disabled={pending}
          onClick={() => onDisable(user)}
        >
          <Ban className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" icon aria-label={`Delete ${user.email}`} disabled={pending} onClick={() => onDelete(user)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }
}
