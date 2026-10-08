import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createEnvironment,
  createGroup,
  addGroupMember,
  createAccessRule,
  previewPolicyAction,
  applyPolicyAction,
  rollbackPolicyAction,
} from "@/lib/actions/workspace";
import { PolicyControls } from "@/components/workspace/policy-controls";
import { InvitePanel } from "@/components/auth/invite-panel";
import { auth } from "@/lib/auth";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";

export default async function WorkspacePage() {
  const org = await getDefaultOrganization();
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  const canInvite = authz ? hasCapability(authz.capabilities, "members.invite") : false;

  const [environments, groups, rules, latestSnapshot, pendingInvites] = await Promise.all([
    prisma.environment.findMany({ where: { organizationId: org.id }, orderBy: { sortOrder: "asc" } }),
    prisma.group.findMany({
      where: { organizationId: org.id },
      include: { members: true },
    }),
    prisma.accessRule.findMany({
      where: { organizationId: org.id },
      include: { group: true, environment: true },
    }),
    prisma.policySnapshot.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
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

  return (
    <div className="flex flex-col gap-16">
      <div>
        <h1>Workspace</h1>
        <p className="mt-4 max-w-2xl text-graphite">
          Environments, groups, and access rules compile into Headscale policy.
        </p>
      </div>

      <section className="grid gap-8 lg:grid-cols-2">
        <Card>
          <h2>Environments</h2>
          <ul className="mt-4 space-y-2">
            {environments.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-[var(--color-ash)] py-2">
                <span>{e.name}</span>
                <code className="text-sm text-smoke">{e.tag}</code>
              </li>
            ))}
          </ul>
          <form action={createEnvironment} className="mt-6 flex flex-col gap-3">
            <input
              name="slug"
              placeholder="slug (e.g. staging)"
              className="rounded-[100px] border border-[var(--color-ash)] px-3 py-2"
              required
            />
            <input
              name="name"
              placeholder="Display name"
              className="rounded-[100px] border border-[var(--color-ash)] px-3 py-2"
            />
            <input
              name="tag"
              placeholder="tag:staging"
              className="rounded-[100px] border border-[var(--color-ash)] px-3 py-2"
            />
            <Button type="submit" variant="secondary">
              Add environment
            </Button>
          </form>
        </Card>

        <Card>
          <h2>Groups</h2>
          {groups.map((g) => (
            <div key={g.id} className="mt-4 border-t border-[var(--color-ash)] pt-4">
              <p className="font-[540]">{g.name}</p>
              <ul className="mt-2 text-sm text-graphite">
                {g.members.map((m) => (
                  <li key={m.id}>{m.email}</li>
                ))}
              </ul>
              <form action={addGroupMember} className="mt-2 flex gap-2">
                <input type="hidden" name="groupId" value={g.id} />
                <input
                  name="email"
                  type="email"
                  placeholder="member@example.com"
                  className="flex-1 rounded-[100px] border border-[var(--color-ash)] px-2 py-1 text-sm"
                  required
                />
                <Button type="submit" variant="secondary" className="!min-h-0 !py-1 text-sm">
                  Add
                </Button>
              </form>
            </div>
          ))}
          <form action={createGroup} className="mt-6 flex gap-2">
            <input
              name="name"
              placeholder="Group name"
              className="flex-1 rounded-[100px] border border-[var(--color-ash)] px-3 py-2"
              required
            />
            <Button type="submit" variant="secondary">
              Create group
            </Button>
          </form>
        </Card>
      </section>

      <Card>
        <h2>Access rules</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-ash)]">
              <th className="py-2">Group</th>
              <th>Environment</th>
              <th>Ports</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-ash)]">
                <td className="py-2">{r.group.name}</td>
                <td>{r.environment.tag}</td>
                <td>{r.ports}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={createAccessRule} className="mt-6 grid gap-3 md:grid-cols-4">
          <select name="groupId" className="rounded-[100px] border border-[var(--color-ash)] px-2 py-2" required>
            <option value="">Group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            name="environmentId"
            className="rounded-[100px] border border-[var(--color-ash)] px-2 py-2"
            required
          >
            <option value="">Environment</option>
            {environments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <input
            name="ports"
            defaultValue="*"
            className="rounded-[100px] border border-[var(--color-ash)] px-2 py-2"
          />
          <Button type="submit" variant="secondary">
            Add rule
          </Button>
        </form>
      </Card>

      {canInvite && (
        <Card>
          <h2>Member invites</h2>
          <p className="mt-2 text-sm text-graphite">
            Generate a one-time code and share the accept link with the invitee.
          </p>
          <InvitePanel pendingInvites={pendingInvites} />
        </Card>
      )}

      <PolicyControls
        latestSnapshotId={latestSnapshot?.id ?? null}
        previewAction={previewPolicyAction}
        applyAction={applyPolicyAction}
        rollbackAction={rollbackPolicyAction}
      />
    </div>
  );
}
