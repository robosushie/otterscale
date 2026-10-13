import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { AuditTable } from "@/components/audit/audit-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function AuditPage({ category, title, description }: { category: "SYSTEM" | "NETWORK"; title: string; description: string }) {
  const [events, setEvents] = useState<{ id: string; createdAt: string; action: string; actorEmail: string | null }[]>([]);
  useEffect(() => {
    void api.audit(category).then((rows) => setEvents(rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      actorEmail: row.actor || null,
    })))).catch(() => setEvents([]));
  }, [category]);
  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        action={<a href="/api/audit/export"><Button variant="secondary">Export JSONL</Button></a>}
      />
      <AuditTable events={events} empty={category === "SYSTEM" ? "No system events yet." : "No network events yet."} />
      <Link to={category === "SYSTEM" ? "/audit/network" : "/audit/system"} className="sr-only">Switch log</Link>
    </div>
  );
}
