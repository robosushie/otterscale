import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { displayUserRole, accessRoleKey } from "@/lib/console/user-role";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { InviteForm, PendingInvitesTable } from "@/components/auth/invite-panel";
import { UsersTable } from "@/components/users/users-table";

export default async function UsersPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "members.view")) redirect("/machines");

  const org = await getDefaultOrganization();
  const canInvite = hasCapability(authz.capabilities, "members.invite");

  const [users, groups, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      include: {
        platformMemberships: true,
        tenantMemberships: { orderBy: { createdAt: "asc" } },
        workspaceMemberships: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.group.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    canInvite
      ? prisma.userInvite.findMany({
          where: {
            organizationId: org.id,
            redeemedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const workspaceOptions = groups.map((group) => ({ id: group.id, name: group.name }));
  const rows = users.map((u) => ({
    id: u.id,
    name: u.name?.trim() || u.username || u.email,
    email: u.email,
    role: displayUserRole(
      u.platformMemberships.map((m) => m.role),
      u.tenantMemberships.map((m) => m.role),
    ),
    roleKey: accessRoleKey(
      u.platformMemberships.map((m) => m.role),
      u.tenantMemberships.map((m) => m.role),
    ),
    joined: u.createdAt.toLocaleDateString(),
    workspaceIds: u.workspaceMemberships.map((membership) => membership.groupId),
  }));

  return (
    <div>
      <PageHeader
        title="Users"
        description="People on this tailnet and their access."
        action={
          canInvite ? (
            <AddPanel buttonLabel="Add user" title="Add user">
              <InviteForm
                workspaces={workspaceOptions}
                canAssignSuperAdmin={hasCapability(authz.capabilities, "platform.manage_admins")}
              />
            </AddPanel>
          ) : null
        }
      />

      <UsersTable
        users={rows}
        workspaces={workspaceOptions}
        canManage={canInvite}
        canAssignSuperAdmin={hasCapability(authz.capabilities, "platform.manage_admins")}
        currentUserId={authz.userId}
      />

      {canInvite ? <PendingInvitesTable pendingInvites={pendingInvites} /> : null}
    </div>
  );
}
