import Link from "next/link";
import { redirect } from "next/navigation";
import { AuditCategory } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTable } from "@/components/audit/audit-table";

export default async function AuditSystemPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "audit.view")) redirect("/machines");

  const org = await getDefaultOrganization();
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: org.id, category: AuditCategory.SYSTEM },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div>
      <PageHeader
        title="System logs"
        description="Append-only control-plane log (users, policy, settings) with hash chain integrity. Not a packet capture."
        action={
          <Link href="/api/v1/audit/export">
            <Button variant="secondary">Export JSONL</Button>
          </Link>
        }
      />
      <AuditTable
        events={events.map((e) => ({
          id: e.id,
          createdAt: e.createdAt,
          action: e.action,
          actorEmail: e.actor?.email ?? null,
          eventHash: e.eventHash,
        }))}
        empty="No system events yet."
      />
    </div>
  );
}
