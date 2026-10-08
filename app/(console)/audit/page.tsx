import Link from "next/link";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AuditPage() {
  const org = await getDefaultOrganization();
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { email: true } } },
  });

  return (
    <div className="flex flex-col gap-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Audit</h1>
          <p className="mt-4 text-graphite">
            Append-only control-plane log with hash chain integrity.
          </p>
        </div>
        <Link href="/api/v1/audit/export">
          <Button variant="secondary">Export JSONL</Button>
        </Link>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-[var(--color-ash)]">
              <th className="py-2 pr-4">Time</th>
              <th className="pr-4">Action</th>
              <th className="pr-4">Actor</th>
              <th>Hash</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-[var(--color-ash)]">
                <td className="py-2 pr-4 whitespace-nowrap">
                  {e.createdAt.toISOString()}
                </td>
                <td className="pr-4">{e.action}</td>
                <td className="pr-4">{e.actor?.email ?? "—"}</td>
                <td className="font-mono text-xs">{e.eventHash.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
