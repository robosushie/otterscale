import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { InviteForm } from "@/components/auth/invite-panel";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { UsersTable, type UserRow } from "@/components/users/users-table";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useLive } from "@/hooks/use-live";

function roleKeyFor(role: string, platformRole: string | null): UserRow["roleKey"] {
  if (platformRole === "SUPER_ADMIN" || role === "SUPER_ADMIN" || role === "Super admin") return "SUPER_ADMIN";
  if (role === "OWNER" || role === "Owner") return "OWNER";
  if (role === "ADMIN" || role === "Admin") return "ADMIN";
  return "MEMBER";
}

function roleLabel(role: string, platformRole: string | null) {
  if (platformRole === "SUPER_ADMIN") return "Super admin";
  if (role === "ADMIN") return "Admin";
  if (role === "MEMBER") return "Member";
  return role;
}

function rowsFrom(users: Awaited<ReturnType<typeof api.users>>): UserRow[] {
  return users.map((user) => ({
    id: user.id,
    name: user.name?.trim() || user.username || user.email,
    email: user.email,
    role: user.role,
    roleKey: roleKeyFor(user.roleKey || user.role, null),
    joined: user.joined || "—",
    workspaceIds: user.workspaceIds ?? [],
    workspaces: user.workspaces ?? [],
    loginDisabled: Boolean(user.loginDisabled),
  }));
}

export function UsersPage({ title = "Users", description = "People on this tailnet and their access.", requireInvite = false }: { title?: string; description?: string; requireInvite?: boolean }) {
  const ctx = useCapabilities();
  const canInvite = ctx.capabilities.includes("members.invite");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; email: string; username: string; tenantRole: string; platformRole: string | null; expiresAt: Date; workspaceIds: string[]; workspaces: string[] }[]>([]);
  const load = useCallback(() => {
    void api.users().then((rows) => setUsers(rowsFrom(rows))).catch(() => setUsers([]));
    void api.workspaces().then((rows) => setWorkspaces(rows.map((row) => ({ id: row.id, name: row.name })))).catch(() => undefined);
    if (canInvite) {
      void api.invites().then((rows) => setInvites(rows.map((row) => ({ ...row, expiresAt: new Date(row.expiresAt), workspaceIds: row.workspaceIds ?? [], workspaces: row.workspaces ?? [] })))).catch(() => setInvites([]));
    }
  }, [canInvite]);
  useEffect(load, [load]);
  const applyLive = useCallback((payload: { users: Awaited<ReturnType<typeof api.users>>; invites: Awaited<ReturnType<typeof api.invites>> }) => {
    setUsers(rowsFrom(payload.users ?? []));
    setInvites((payload.invites ?? []).map((row) => ({ ...row, expiresAt: new Date(row.expiresAt), workspaceIds: row.workspaceIds ?? [], workspaces: row.workspaces ?? [] })));
  }, []);
  useLive("users", applyLive);
  if (requireInvite && !canInvite) return null;
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={canInvite ? (
          <AddPanel buttonLabel="Add user" title="Add user">
            <InviteForm workspaces={workspaces} canAssignSuperAdmin={ctx.capabilities.includes("platform.manage_admins")} onCreated={load} />
          </AddPanel>
        ) : null}
      />
      <UsersTable
        users={[
          ...users,
          ...invites.map((invite) => ({
            id: invite.id,
            name: invite.username,
            email: invite.email,
            role: roleLabel(invite.tenantRole, invite.platformRole),
            roleKey: roleKeyFor(invite.tenantRole, invite.platformRole),
            joined: "Invited",
            workspaceIds: invite.workspaceIds,
            workspaces: invite.workspaces,
            pending: true,
          })),
        ]}
        workspaces={workspaces}
        canManage={canInvite}
        canAssignSuperAdmin={ctx.capabilities.includes("platform.manage_admins")}
        currentUserId={ctx.userId}
        onChanged={load}
      />
    </div>
  );
}
