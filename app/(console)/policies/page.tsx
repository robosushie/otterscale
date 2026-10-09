import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { applyPolicyAction, previewPolicyAction, rollbackPolicyAction } from "@/lib/actions/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { AddRulePanel } from "@/components/workspace/add-rule-panel";
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
        description="Extra rules on top of workspace isolation."
        action={<AddRulePanel groups={groups} tags={tags} />}
      />

      <p className="mb-3 text-[12px] text-smoke">
        {rules.length} {rules.length === 1 ? "rule" : "rules"}
      </p>
      <table className="console-table mb-10 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Workspace</th>
            <th>Tag</th>
            <th>Ports</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className="border-b border-ash">
              <td>
                <div className="cell">{r.group.name}</div>
              </td>
              <td>
                <div className="cell">{r.tag?.aclTag ?? "—"}</div>
              </td>
              <td>
                <div className="cell">{r.ports}</div>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr>
              <td colSpan={3}>
                <div className="cell text-smoke">No extra rules.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <PolicyControls
        latestSnapshotId={latestSnapshot?.id ?? null}
        previewAction={previewPolicyAction}
        applyAction={applyPolicyAction}
        rollbackAction={rollbackPolicyAction}
      />
    </div>
  );
}
