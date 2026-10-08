import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { loadUserCapabilities } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addSuperAdmin, removeSuperAdmin, updateOrgSettings } from "@/lib/actions/platform";
import { PlatformRole } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function PlatformPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const ctx = await loadUserCapabilities(session.user.id);
  if (!ctx?.capabilities.includes("platform.view")) redirect("/workspace");

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
    <div className="flex flex-col gap-16">
      <div>
        <h1>Platform</h1>
        <p className="mt-4 text-graphite">
          Single-organisation settings and super admins.
        </p>
      </div>

      <Card>
        <h2>Owner</h2>
        <p className="mt-2">{owner?.user.email ?? "Not assigned"}</p>
      </Card>

      <Card>
        <h2>Super admins</h2>
        <ul className="mt-4 space-y-2">
          {superAdmins.map((m) => (
            <li key={m.id} className="flex items-center justify-between border-b border-[var(--color-ash)] py-2">
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
          <form action={addSuperAdmin} className="mt-6 flex gap-2">
            <input
              name="email"
              type="email"
              placeholder="user@example.com"
              className="flex-1 rounded-lg border border-[var(--color-ash)] px-3 py-2"
              required
            />
            <Button type="submit" variant="secondary">
              Add super admin
            </Button>
          </form>
        )}
      </Card>

      {ctx.capabilities.includes("platform.settings") && (
        <Card>
          <h2>Organisation settings</h2>
          <form action={updateOrgSettings} className="mt-4 flex flex-col gap-3 max-w-md">
            <label className="text-sm">
              Headscale public URL (for clients)
              <input
                name="headscalePublicUrl"
                defaultValue={org.settings?.headscalePublicUrl ?? ""}
                className="mt-1 w-full rounded-lg border border-[var(--color-ash)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Relay map URL
              <input
                name="relayMapUrl"
                defaultValue={org.settings?.relayMapUrl ?? ""}
                className="mt-1 w-full rounded-lg border border-[var(--color-ash)] px-3 py-2"
              />
            </label>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
