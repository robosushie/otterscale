"use server";

import { revalidatePath } from "next/cache";
import { AuditCategory, PublishedAppStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";
import { parseIpAddresses, preferMeshIp } from "@/lib/machines/sync";
import { probeAppListenAddress, writeAppsRoutes } from "@/lib/apps/publish";
import { compileAndApply } from "@/lib/services/policy-apply";
import { fail, ok, okVoid, type ActionResult } from "@/lib/actions/result";

function revalidateApps() {
  revalidatePath("/apps");
  revalidatePath("/policies");
}

async function applyPolicyQuiet(actorId: string) {
  try {
    await compileAndApply(actorId);
  } catch {
    /* optional Headscale */
  }
}

function sanitizeSubdomain(raw: string): string | null {
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!slug || slug.length > 63) return null;
  return slug;
}

export async function publishApp(formData: FormData): Promise<ActionResult<{ status: PublishedAppStatus; error?: string }>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const org = await getDefaultOrganization();
  const machineId = String(formData.get("machineId") ?? "");
  const port = Number(formData.get("port"));
  const subdomain = sanitizeSubdomain(String(formData.get("subdomain") ?? ""));
  if (!machineId) return fail("Machine required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail("Port must be 1–65535");
  if (!subdomain) return fail("Subdomain required");

  const machine = await prisma.machine.findUnique({ where: { id: machineId } });
  if (!machine) return fail("Machine not found");
  const ip = preferMeshIp(parseIpAddresses(machine.ipAddresses));
  if (!ip) return fail("Machine has no mesh IP yet. Wait until it is online.");

  const probe = await probeAppListenAddress(ip, port);
  const status = probe.ok ? PublishedAppStatus.ACTIVE : PublishedAppStatus.UNREACHABLE;

  const app = await prisma.publishedApp.upsert({
    where: { organizationId_subdomain: { organizationId: org.id, subdomain } },
    create: {
      organizationId: org.id,
      machineId,
      port,
      subdomain,
      status,
      lastError: probe.ok ? null : probe.error ?? "Unreachable",
    },
    update: {
      machineId,
      port,
      status,
      lastError: probe.ok ? null : probe.error ?? "Unreachable",
    },
  });

  await writeAppsRoutes(org.id);
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "app.published",
    category: AuditCategory.NETWORK,
    resourceType: "published_app",
    resourceId: app.id,
    afterJson: { subdomain, port, machineId, status },
  });
  await applyPolicyQuiet(session.user.id);
  revalidateApps();
  if (!probe.ok) {
    return ok({ status, error: probe.error ?? "Unreachable from the mesh proxy" });
  }
  return ok({ status });
}

export async function deleteApp(formData: FormData): Promise<ActionResult<void>> {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const org = await getDefaultOrganization();
  const appId = String(formData.get("appId") ?? "");
  if (!appId) return fail("App required");
  await prisma.publishedApp.deleteMany({ where: { id: appId, organizationId: org.id } });
  await writeAppsRoutes(org.id);
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "app.deleted",
    category: AuditCategory.NETWORK,
    resourceType: "published_app",
    resourceId: appId,
  });
  await applyPolicyQuiet(session.user.id);
  revalidateApps();
  return okVoid();
}

export async function deleteAppForm(formData: FormData): Promise<void> {
  const result = await deleteApp(formData);
  if (!result.ok) throw new Error(result.error);
}
