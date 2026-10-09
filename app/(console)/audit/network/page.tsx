import { redirect } from "next/navigation";
import { AuditCategory } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { AuditTable } from "@/components/audit/audit-table";

export default async function AuditNetworkPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "audit.view")) redirect("/machines");

  const org = await getDefaultOrganization();
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: org.id, category: AuditCategory.NETWORK },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div>
      <PageHeader title="Network logs" description="Machine and auth-key events." />
      <AuditTable
        events={events.map((e) => ({
          id: e.id,
          createdAt: e.createdAt,
          action: e.action,
          actorEmail: e.actor?.email ?? null,
          eventHash: e.eventHash,
        }))}
        empty="No network events yet. Open Machines to poll lastSeen."
      />
    </div>
  );
}
