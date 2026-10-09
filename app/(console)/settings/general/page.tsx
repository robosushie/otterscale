import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addSuperAdmin, removeSuperAdmin, updateOrgSettings } from "@/lib/actions/platform";
import { PlatformRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { controlClassName } from "@/components/ui/field";

export default async function SettingsGeneralPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx?.capabilities.includes("platform.view")) redirect("/machines");

  const org = await getDefaultOrganization();
  const superAdmins = await prisma.platformMembership.findMany({
    where: { role: PlatformRole.SUPER_ADMIN },
    include: { user: true },
  });
  const owner = await prisma.platformMembership.findFirst({
    where: { role: PlatformRole.OWNER },
    include: { user: true },
  });

  return (
    <div>
      <PageHeader title="General" description="Organisation display name, tailnet id, owner, and super admins." />

      <Card className="mb-6">
        <h2 className="text-[24px]">Organisation</h2>
        <p className="mt-2 text-sm text-graphite">
          Tailnet / org id: <code>{org.id}</code> · slug <code>{org.slug}</code>
        </p>
        {ctx.capabilities.includes("platform.settings") ? (
          <form action={updateOrgSettings} className="mt-4 flex max-w-md flex-col gap-3">
            <label className="text-sm">
              Display name
              <input name="name" defaultValue={org.name} className={controlClassName} required />
            </label>
            <label className="text-sm">
              Apps base domain
              <input
                name="appsBaseDomain"
                defaultValue={org.settings?.appsBaseDomain ?? "apps.localhost"}
                className={controlClassName}
              />
            </label>
            <label className="text-sm">
              Relay map URL
              <input
                name="relayMapUrl"
                defaultValue={org.settings?.relayMapUrl ?? ""}
                className={controlClassName}
              />
            </label>
            <Button type="submit" variant="secondary" className="self-start">
              Save
            </Button>
          </form>
        ) : (
          <p className="mt-3">{org.name}</p>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="text-[24px]">Owner</h2>
        <p className="mt-2">{owner?.user.email ?? "Not assigned"}</p>
        <p className="mt-1 text-sm text-smoke">Owner is immutable in this phase.</p>
      </Card>

      <Card className="mb-6">
        <h2 className="text-[24px]">Super admins</h2>
        <ul className="mt-4 space-y-2">
          {superAdmins.map((m) => (
            <li key={m.id} className="flex items-center justify-between border-b border-ash py-2">
              <span>{m.user.email}</span>
              {ctx.isOwner && m.user.id !== session.user.id && (
                <form action={removeSuperAdmin}>
                  <input type="hidden" name="userId" value={m.user.id} />
                  <Button type="submit" variant="ghost" className="!min-h-0 text-sm">
                    Remove
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {ctx.isOwner && (
          <form action={addSuperAdmin} className="mt-6 flex max-w-xl gap-2">
            <input
              name="email"
              type="email"
              placeholder="user@example.com"
              className={`${controlClassName} mt-0 flex-1`}
              required
            />
            <Button type="submit" variant="secondary">
              Add super admin
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
