import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLoginServerUrl } from "@/lib/headscale/login-server";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { AddPanel } from "@/components/ui/side-panel";
import { AuthKeyForm } from "@/components/network/auth-key-form";
import { MachinesLive } from "@/components/network/machines-live";
import { buildMachinesTable } from "@/lib/machines/list";
import { DEFAULT_AUTH_KEY_EXPIRY } from "@/lib/headscale/expiry";

function expiryFromHours(hours: number | null | undefined): string {
  if (!hours || hours === 24) return DEFAULT_AUTH_KEY_EXPIRY;
  if (hours === 1) return "1 hour";
  if (hours === 168) return "7 days";
  if (hours === 2160) return "90 days";
  return `${hours}h`;
}

export default async function MachinesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "network.view")) redirect("/signin");

  const org = await getDefaultOrganization();
  const table = await buildMachinesTable(authz);
  const loginServer = getLoginServerUrl();
  const assignableTags = table.tags;

  return (
    <div>
      <PageHeader
        title="Machines"
        description="Devices on your tailnet."
        action={
          table.canManage ? (
            <AddPanel buttonLabel="Add machine" title="Add machine">
              <AuthKeyForm
                loginServer={loginServer}
                workspaces={table.workspaces}
                tags={assignableTags}
                defaultExpiry={expiryFromHours(org.settings?.defaultAuthKeyExpiryHours)}
              />
            </AddPanel>
          ) : null
        }
      />

      {!table.configured ? (
        <p className="mb-4 text-sm text-smoke">
          Set HEADSCALE_INTERNAL_URL and HEADSCALE_API_KEY to load devices.
        </p>
      ) : null}

      <MachinesLive initial={table} />
    </div>
  );
}
