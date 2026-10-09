import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import {
  applyPolicyAction,
  createAccessRuleForm,
  previewPolicyAction,
  rollbackPolicyAction,
} from "@/lib/actions/workspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PolicyControls } from "@/components/workspace/policy-controls";

export default async function PoliciesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "workspace.policy")) redirect("/machines");

  const org = await getDefaultOrganization();
  const [tags, groups, rules, latestSnapshot] = await Promise.all([
    prisma.tag.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.group.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }),
    prisma.accessRule.findMany({
      where: { organizationId: org.id },
      include: { group: true, tag: true },
    }),
    prisma.policySnapshot.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Policies"
        description="Workspace membership already allows same-workspace peers. Extra rules grant a workspace access to a tag. Owner and super admin emails own every tag."
      />

      <Card className="mb-8">
        <h2 className="text-[24px]">Extra access rules</h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ash">
              <th className="py-2">Workspace</th>
              <th>Tag</th>
              <th>Ports</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-ash">
                <td className="py-2">{r.group.name}</td>
                <td>{r.tag?.aclTag ?? "—"}</td>
                <td>{r.ports}</td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-smoke">
                  No extra rules. Isolation is workspace-only by default.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <form action={createAccessRuleForm} className="mt-6 flex max-w-3xl flex-wrap gap-3">
          <select name="groupId" className={`${controlClassName} mt-0 max-w-xs`} required>
            <option value="">Workspace</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select name="tagId" className={`${controlClassName} mt-0 max-w-xs`}>
            <option value="">Tag (optional)</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input name="ports" defaultValue="*" className={`${controlClassName} mt-0 max-w-[8rem]`} />
          <Button type="submit" variant="secondary">
            Add rule
          </Button>
        </form>
      </Card>

      <PolicyControls
        latestSnapshotId={latestSnapshot?.id ?? null}
        previewAction={previewPolicyAction}
        applyAction={applyPolicyAction}
        rollbackAction={rollbackPolicyAction}
      />
    </div>
  );
}
