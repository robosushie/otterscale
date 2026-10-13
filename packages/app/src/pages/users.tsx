import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { InviteForm, PendingInvitesTable } from "@/components/auth/invite-panel";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { UsersTable, type UserRow } from "@/components/users/users-table";
import { useCapabilities } from "@/hooks/use-capabilities";

function rowsFrom(users: Awaited<ReturnType<typeof api.users>>): UserRow[] {
  return users.map((user) => ({
    id: user.id,
    name: user.name?.trim() || user.username || user.email,
    email: user.email,
    role: user.role,
    roleKey: (user.roleKey as UserRow["roleKey"]) || (user.role === "Owner" ? "OWNER" : user.role === "Super admin" ? "SUPER_ADMIN" : user.role === "Admin" ? "ADMIN" : "MEMBER"),
    joined: user.joined || "—",
    workspaceIds: user.workspaceIds ?? [],
  }));
}

export function UsersPage({ title = "Users", description = "People on this tailnet and their access.", requireInvite = false }: { title?: string; description?: string; requireInvite?: boolean }) {
  const ctx = useCapabilities();
  const canInvite = ctx.capabilities.includes("members.invite");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [invites, setInvites] = useState<{ id: string; email: string; username: string; tenantRole: string; platformRole: string | null; expiresAt: Date }[]>([]);
  const load = () => {
    void api.users().then((rows) => setUsers(rowsFrom(rows))).catch(() => setUsers([]));
    void api.workspaces().then((rows) => setWorkspaces(rows.map((row) => ({ id: row.id, name: row.name })))).catch(() => undefined);
    if (canInvite) {
      void api.invites().then((rows) => setInvites(rows.map((row) => ({ ...row, expiresAt: new Date(row.expiresAt) })))).catch(() => setInvites([]));
    }
  };
  useEffect(load, [canInvite]);
  if (requireInvite && !canInvite) return null;
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={canInvite ? (
          <AddPanel buttonLabel="Add user" title="Add user">
            <InviteForm workspaces={workspaces} canAssignSuperAdmin={ctx.capabilities.includes("platform.manage_admins")} />
          </AddPanel>
        ) : null}
      />
      <UsersTable
        users={users}
        workspaces={workspaces}
        canManage={canInvite}
        canAssignSuperAdmin={ctx.capabilities.includes("platform.manage_admins")}
        currentUserId={ctx.userId}
      />
      {canInvite ? <PendingInvitesTable pendingInvites={invites} /> : null}
    </div>
  );
}
