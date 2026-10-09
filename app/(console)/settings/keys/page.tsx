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
      <PageHeader title="Keys" description="Pre-auth keys issued for device join." />
      {error ? (
        <Card>
          <p className="text-graphite">{error}</p>
        </Card>
      ) : (
        <table className="console-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ash">
              <th>Key</th>
              <th>Reusable</th>
              <th>Tags</th>
              <th>Expires</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id || k.key} className="border-b border-ash">
                <td>
                  <div className="cell font-mono text-xs">{k.key ? `${k.key.slice(0, 12)}…` : k.id}</div>
                </td>
                <td>
                  <div className="cell">{k.reusable ? "Yes" : "No"}</div>
                </td>
                <td>
                  <div className="cell">{k.aclTags?.join(", ") || "—"}</div>
                </td>
                <td>
                  <div className="cell tabular-nums">{k.expiration ? new Date(k.expiration).toLocaleString() : "—"}</div>
                </td>
                <td className="actions">
                  <div className="cell-end">
                    <ExpireKeyButton authKey={k.key} />
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="cell text-smoke">No auth keys yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
