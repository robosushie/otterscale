import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { addGroupMemberForm, createGroupForm, createTagForm } from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

export default async function WorkspacesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "workspace.manage")) redirect("/machines");

  const org = await getDefaultOrganization();
  const [groups, tags] = await Promise.all([
    prisma.group.findMany({
      where: { organizationId: org.id },
      include: { members: true, memberships: { include: { user: { select: { email: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.tag.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Workspaces"
        description="Workspaces isolate peers: humans and nodes that share a workspace can reach each other. They compile into Headscale ACL groups. Tags are orthogonal labels (prod, uat, or custom)."
      />

      <Card className="mb-8">
        <h2 className="text-[24px]">Create workspace</h2>
        <form action={createGroupForm} className="mt-4 flex max-w-xl flex-wrap gap-3">
          <input name="name" placeholder="Workspace name" className={`${controlClassName} mt-0 flex-1`} required />
          <Button type="submit">Create workspace</Button>
        </form>
      </Card>

      <Card className="mb-8">
        <h2 className="text-[24px]">Tags</h2>
        <p className="mt-2 text-sm text-graphite">
          ACL tags such as <code>tag:prod</code>. Assign them on machines; they do not isolate peers.
        </p>
        <ul className="mt-3 text-sm text-graphite">
          {tags.map((t) => (
            <li key={t.id} className="border-b border-ash py-2">
              {t.name} <span className="text-smoke">({t.aclTag})</span>
            </li>
          ))}
          {tags.length === 0 && <li className="text-smoke">No tags yet.</li>}
        </ul>
        <form action={createTagForm} className="mt-4 flex max-w-xl flex-wrap gap-3">
          <input name="name" placeholder="prod" className={`${controlClassName} mt-0 flex-1`} required />
          <Button type="submit" variant="secondary">
            Add tag
          </Button>
        </form>
      </Card>

      {groups.map((g) => (
        <Card key={g.id} className="mb-4">
          <h2 className="text-[24px]">{g.name}</h2>
          <ul className="mt-3 text-sm text-graphite">
            {g.members.map((m) => (
              <li key={m.id} className="border-b border-ash py-2">
                {m.email}
              </li>
            ))}
            {g.members.length === 0 && <li className="text-smoke">No members yet.</li>}
          </ul>
          <form action={addGroupMemberForm} className="mt-4 flex max-w-xl flex-wrap gap-3">
            <input type="hidden" name="groupId" value={g.id} />
            <input
              name="email"
              type="email"
              placeholder="member@example.com"
              className={`${controlClassName} mt-0 flex-1`}
              required
            />
            <select name="role" className={`${controlClassName} mt-0 w-36`} defaultValue="MEMBER">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button type="submit" variant="secondary">
              Add member
            </Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
