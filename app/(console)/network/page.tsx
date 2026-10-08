import { listNodes, isHeadscaleConfigured } from "@/lib/headscale/client";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { Card } from "@/components/ui/card";
import { AuthKeyForm } from "@/components/network/auth-key-form";

export default async function NetworkPage() {
  const org = await getDefaultOrganization();
  const environments = await prisma.environment.findMany({
    where: { organizationId: org.id },
    orderBy: { sortOrder: "asc" },
  });

  let nodes: Awaited<ReturnType<typeof listNodes>> = [];
  let headscaleError: string | null = null;
  if (isHeadscaleConfigured()) {
    try {
      nodes = await listNodes();
    } catch (e) {
      headscaleError = e instanceof Error ? e.message : "Failed to reach Headscale";
    }
  }

  return (
    <div className="flex flex-col gap-16">
      <div>
        <h1>Network</h1>
        <p className="mt-4 text-graphite">
          Devices and auth keys from your Headscale instance. Use official Tailscale clients with
          your login server URL.
        </p>
      </div>

      {!isHeadscaleConfigured() && (
        <Card>
          <p className="text-graphite">
            Set <code>HEADSCALE_INTERNAL_URL</code> and <code>HEADSCALE_API_KEY</code> to load
            devices.
          </p>
        </Card>
      )}

      {headscaleError && (
        <Card>
          <p className="text-off-black">{headscaleError}</p>
        </Card>
      )}

      <Card>
        <h2>Devices</h2>
        <table className="mt-4 w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-[var(--color-ash)]">
              <th className="py-2">Name</th>
              <th>Hostname</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-b border-[var(--color-ash)]">
                <td className="py-2">{n.name ?? "—"}</td>
                <td>{n.hostname ?? "—"}</td>
                <td>{(n.tags ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
            {nodes.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-smoke">
                  No devices registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2>Create auth key</h2>
        <AuthKeyForm environments={environments.map((e) => ({ tag: e.tag, name: e.name }))} />
      </Card>
    </div>
  );
}
