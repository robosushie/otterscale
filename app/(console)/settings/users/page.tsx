import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { displayUserRole, accessRoleKey } from "@/lib/console/user-role";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InvitePanel } from "@/components/auth/invite-panel";
import { UsersTable } from "@/components/users/users-table";

export default async function SettingsUsersPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "members.invite")) redirect("/machines");

  const org = await getDefaultOrganization();
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
    prisma.userInvite.findMany({
      where: {
        organizationId: org.id,
        redeemedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

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
        title="User management"
        description="Invite people as Super admin, Admin, or Member, and assign workspaces. Owner and super admin are in every workspace automatically."
        action={
          <Link href="/users" className="link text-sm">
            Open Users
          </Link>
        }
      />

      <Card className="mb-8">
        <h2 className="text-[24px]">Invite users</h2>
        <InvitePanel
          pendingInvites={pendingInvites}
          workspaces={groups.map((group) => ({ id: group.id, name: group.name }))}
          canAssignSuperAdmin={hasCapability(authz.capabilities, "platform.manage_admins")}
        />
      </Card>

      <UsersTable
        users={rows}
        workspaces={groups.map((group) => ({ id: group.id, name: group.name }))}
        canManage
        canAssignSuperAdmin={hasCapability(authz.capabilities, "platform.manage_admins")}
        currentUserId={authz.userId}
      />
    </div>
  );
}
