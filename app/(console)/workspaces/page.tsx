import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { WorkspacesBoard } from "@/components/workspace/workspaces-board";

export default async function WorkspacesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "workspace.manage")) redirect("/machines");

  const org = await getDefaultOrganization();
  const groups = await prisma.group.findMany({
    where: { organizationId: org.id },
    include: { members: true, memberships: { include: { user: { select: { email: true } } } } },
    orderBy: { name: "asc" },
  });

  const workspaces = groups.map((group) => {
    const emails = new Set<string>();
    for (const member of group.members) emails.add(member.email);
    for (const membership of group.memberships) {
      if (membership.user.email) emails.add(membership.user.email);
    }
    return { id: group.id, name: group.name, members: [...emails] };
  });

  return <WorkspacesBoard workspaces={workspaces} />;
}
