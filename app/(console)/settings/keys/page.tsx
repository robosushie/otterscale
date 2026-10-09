import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { formatHeadscaleError, isHeadscaleConfigured, listPreAuthKeys } from "@/lib/headscale/client";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ExpireKeyButton } from "@/components/network/expire-key-button";

export default async function SettingsKeysPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "network.manage")) redirect("/machines");

  let keys: Awaited<ReturnType<typeof listPreAuthKeys>> = [];
  let error: string | null = null;
  if (!isHeadscaleConfigured()) {
    error = "Headscale is not configured.";
  } else {
    try {
      keys = await listPreAuthKeys();
    } catch (e) {
      error = formatHeadscaleError(e);
    }
  }

  return (
    <div>
      <PageHeader
        title="Keys"
        description="Pre-auth keys issued for tagged-devices. Generate new keys from Machines → Add device."
      />
      {error ? (
        <Card>
          <p className="text-graphite">{error}</p>
        </Card>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ash">
              <th className="py-2">Key</th>
              <th>Reusable</th>
              <th>Tags</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id || k.key} className="border-b border-ash">
                <td className="py-3 font-mono text-xs">{k.key ? `${k.key.slice(0, 12)}…` : k.id}</td>
                <td>{k.reusable ? "Yes" : "No"}</td>
                <td>{k.aclTags?.join(", ") || "—"}</td>
                <td className="tabular-nums">{k.expiration ? new Date(k.expiration).toLocaleString() : "—"}</td>
                <td className="py-3">
                  <ExpireKeyButton authKey={k.key} />
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-smoke">
                  No auth keys yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
