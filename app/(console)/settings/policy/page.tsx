import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default async function SettingsPolicyPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "workspace.policy")) redirect("/machines");

  const org = await getDefaultOrganization();
  const latest = await prisma.policySnapshot.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Policy file"
        description="Otterscale compiles workspace isolation, tags, extra rules, and published-app ACLs into Headscale HuJSON."
        action={
          <Link href="/policies">
            <Button variant="secondary">Open Policies</Button>
          </Link>
        }
      />
      <Card>
        <p className="text-sm text-graphite">
          Latest snapshot: {latest ? `${latest.status} · ${latest.contentHash.slice(0, 12)}…` : "none"}
        </p>
        {latest ? (
          <pre className="mt-4 max-h-[28rem] overflow-auto text-xs whitespace-pre-wrap">{latest.hujson}</pre>
        ) : (
          <p className="mt-4 text-smoke">Preview and apply policy from Access controls → Policies.</p>
        )}
      </Card>
    </div>
  );
}
