import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { prisma, sqliteReady } from "@/lib/db";
import { generateAppsRoutes } from "@/lib/apps/routes";
import { parseIpAddresses, preferMeshIp, syncMachinesFromHeadscale } from "@/lib/machines/sync";
import { isHeadscaleConfigured, listNodes } from "@/lib/headscale/client";
import { getDefaultOrganization } from "@/lib/org/singleton";

export async function writeAppsRoutes(organizationId: string): Promise<void> {
  const path = process.env.APPS_ROUTES_PATH;
  if (!path) return;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { settings: true },
  });
  const baseDomain = org?.settings?.appsBaseDomain || process.env.APPS_BASE_DOMAIN || "apps.localhost";
  const apps = await prisma.publishedApp.findMany({
    where: { organizationId },
    include: { machine: true },
  });
  const routes = apps.flatMap((app) => {
    const ip = preferMeshIp(parseIpAddresses(app.machine.ipAddresses));
    if (!ip) return [];
    return [{ id: app.id, subdomain: app.subdomain, ip, port: app.port }];
  });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, generateAppsRoutes(baseDomain, routes), "utf8");
}

/** Sync mesh IPs then write routes.json so the proxy has current IPv4 after stack start. */
export async function refreshAppsRoutesOnBoot(): Promise<void> {
  if (!process.env.APPS_ROUTES_PATH) return;
  await sqliteReady;
  const org = await getDefaultOrganization();
  if (isHeadscaleConfigured()) {
    try {
      await syncMachinesFromHeadscale(org.id, await listNodes());
    } catch {
      /* Headscale may still be settling */
    }
  }
  await writeAppsRoutes(org.id);
}

export async function probeAppListenAddress(ip: string, port: number): Promise<{ ok: boolean; error?: string }> {
  const base = process.env.APPS_PROBE_URL?.replace(/\/$/, "");
  if (base) {
    try {
      const res = await fetch(`${base}/probe?ip=${encodeURIComponent(ip)}&port=${port}`, {
        signal: AbortSignal.timeout(5000),
      });
      const text = await res.text();
      if (res.ok) return { ok: true };
      return { ok: false, error: text || `Probe failed (${res.status})` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Probe unreachable" };
    }
  }

  try {
    const res = await fetch(`http://${ip.includes(":") ? `[${ip}]` : ip}:${port}/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok || res.status < 500) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? `${e.message}. If the process binds localhost only, bind 0.0.0.0 or the mesh IP.`
          : "Unreachable",
    };
  }
}
