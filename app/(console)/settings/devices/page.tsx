import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadAuthzContext } from "@/lib/authz/load-context";
import { hasCapability } from "@/lib/authz/permissions";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { updateDeviceSettings } from "@/lib/actions/platform";
import { Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { controlClassName } from "@/components/ui/field";

export default async function SettingsDevicesPage() {
  const session = await auth();
  const authz = session?.user?.id ? await loadAuthzContext(session.user.id) : null;
  if (!authz || !hasCapability(authz.capabilities, "network.manage")) redirect("/machines");

  const org = await getDefaultOrganization();

  return (
    <div>
      <PageHeader title="Device management" description="Default auth-key expiry for new devices." />
      <Card>
        <form action={updateDeviceSettings} className="flex max-w-md flex-col gap-4">
          <label className="text-sm">
            Default auth key expiry (hours)
            <input
              name="defaultAuthKeyExpiryHours"
              type="number"
              min={1}
              defaultValue={org.settings?.defaultAuthKeyExpiryHours ?? 24}
              className={controlClassName}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-smoke">
            <input type="checkbox" disabled />
            Require device approval (not in Phase 1–2)
          </label>
          <Button type="submit" variant="secondary" icon aria-label="Save device settings" className="self-start">
            <Save className="size-3.5" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
