import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { createTagForm } from "@/lib/actions/workspace";
import { AddPanel } from "@/components/ui/side-panel";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

export default async function TagsPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "workspace.manage")) redirect("/machines");

  const org = await getDefaultOrganization();
  const tags = (
    await prisma.tag.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } })
  ).filter((tag) => tag.aclTag !== "tag:edge" && tag.name.toLowerCase() !== "edge");

  return (
    <div>
      <PageHeader
        title="Tags"
        description="Labels such as prod or uat. They do not isolate peers."
        action={
          <AddPanel buttonLabel="Add tag" title="Add tag">
            <form action={createTagForm} className="flex flex-col gap-4">
              <Field label="Name" hint="Stored as an ACL tag such as tag:prod.">
                <Input name="name" placeholder="prod" required />
              </Field>
              <Button type="submit">Add tag</Button>
            </form>
          </AddPanel>
        }
      />

      <p className="mb-3 text-[12px] text-smoke">
        {tags.length} {tags.length === 1 ? "tag" : "tags"}
      </p>
      <table className="console-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ash">
            <th>Name</th>
            <th>ACL tag</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => (
            <tr key={tag.id} className="border-b border-ash">
              <td>
                <div className="cell">{tag.name}</div>
              </td>
              <td>
                <div className="cell font-mono text-xs">{tag.aclTag}</div>
              </td>
            </tr>
          ))}
          {tags.length === 0 ? (
            <tr>
              <td colSpan={2}>
                <div className="cell text-smoke">No tags yet.</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
