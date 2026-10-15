import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type WorkspaceRow } from "@/api/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { useCapabilities } from "@/hooks/use-capabilities";

type Load<T> = { status: "empty" | "ready"; value: T };

function useSummary() {
  const ctx = useCapabilities();
  const canNetwork = ctx.capabilities.includes("network.view");
  const canMembers = ctx.capabilities.includes("members.view");
  const canWorkspaces = ctx.capabilities.includes("workspace.manage");
  const [machines, setMachines] = useState<Load<{ total: number; online: number }>>({ status: "empty", value: { total: 0, online: 0 } });
  const [apps, setApps] = useState<Load<number>>({ status: "empty", value: 0 });
  const [users, setUsers] = useState<Load<number>>({ status: "empty", value: 0 });
  const [workspaces, setWorkspaces] = useState<Load<WorkspaceRow[]>>({ status: "empty", value: [] });
  const [tags, setTags] = useState<Load<{ id: string; name: string }[]>>({ status: "empty", value: [] });

  useEffect(() => {
    if (!canNetwork) return;
    void api.machines().then((table) => {
      setMachines({ status: "ready", value: { total: table.rows.length, online: table.rows.filter((row) => row.online).length } });
    }).catch(() => undefined);
    void api.apps().then((rows) => {
      setApps({ status: "ready", value: rows.filter((row) => row.status !== "DISABLED").length });
    }).catch(() => undefined);
  }, [canNetwork]);

  useEffect(() => {
    if (!canMembers) return;
    void api.users().then((rows) => setUsers({ status: "ready", value: rows.length })).catch(() => undefined);
  }, [canMembers]);

  useEffect(() => {
    if (!canWorkspaces) return;
    void api.workspaces().then((rows) => setWorkspaces({ status: "ready", value: rows })).catch(() => undefined);
    void api.tags().then((rows) => setTags({ status: "ready", value: rows })).catch(() => undefined);
  }, [canWorkspaces]);

  return { machines, apps, users, workspaces, tags };
}

function Count({ href, value, ready }: { href: string; value: number; ready: boolean }) {
  if (!ready) return <p className="font-display text-[40px] leading-none text-smoke">—</p>;
  return (
    <Link to={href} className="font-display text-[40px] leading-none text-off-black">
      {value}
    </Link>
  );
}

export function DashboardPage() {
  const summary = useSummary();
  return (
    <div>
      <PageHeader title="Dashboard" description="Machines, apps, people, and access on this network." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">Machines</p>
          <Count href="/machines" value={summary.machines.value.total} ready={summary.machines.status === "ready"} />
          <p className="mt-2 text-sm text-graphite">
            {summary.machines.status === "ready" ? `${summary.machines.value.online} online` : "Not available"}
          </p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">Published apps</p>
          <Count href="/apps" value={summary.apps.value} ready={summary.apps.status === "ready"} />
          <p className="mt-2 text-sm text-graphite">{summary.apps.status === "ready" ? "On the mesh" : "Not available"}</p>
        </Card>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">Users</p>
          <Count href="/users" value={summary.users.value} ready={summary.users.status === "ready"} />
          <p className="mt-2 text-sm text-graphite">{summary.users.status === "ready" ? "Accounts" : "Not available"}</p>
        </Card>
        <Card className="md:col-span-2">
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">Workspaces</p>
          {summary.workspaces.status === "ready" ? (
            summary.workspaces.value.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {summary.workspaces.value.map((workspace) => (
                  <li key={workspace.id} className="flex items-baseline justify-between gap-4 text-sm">
                    <Link to="/workspaces" className="text-off-black">{workspace.name}</Link>
                    <span className="text-graphite">{workspace.members.length} {workspace.members.length === 1 ? "user" : "users"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-graphite">No workspaces yet.</p>
          ) : <p className="mt-3 text-sm text-graphite">Not available</p>}
        </Card>
        <Card>
          <p className="text-[12px] font-medium uppercase tracking-[-0.4px] text-smoke">Tags</p>
          {summary.tags.status === "ready" ? (
            summary.tags.value.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {summary.tags.value.map((tag) => (
                  <li key={tag.id}>
                    <Link to="/tags" className="text-sm text-off-black">{tag.name}</Link>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-graphite">No tags yet.</p>
          ) : <p className="mt-3 text-sm text-graphite">Not available</p>}
        </Card>
      </div>
    </div>
  );
}
