"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { createPreAuthKey, isHeadscaleConfigured } from "@/lib/headscale/client";
import { prisma } from "@/lib/db";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { appendAuditEvent } from "@/lib/audit/write";

export async function createAuthKey(formData: FormData) {
  const session = await requireSession();
  await requireCapability(session.user.id, "network.manage");
  const tag = String(formData.get("tag") ?? "");
  const reusable = formData.get("reusable") === "on";

  if (!isHeadscaleConfigured()) {
    throw new Error("Headscale is not configured");
  }

  const { key } = await createPreAuthKey({
    aclTags: tag ? [tag] : [],
    reusable,
    ephemeral: !reusable,
  });

  const org = await getDefaultOrganization();
  await appendAuditEvent({
    organizationId: org.id,
    actorId: session.user.id,
    action: "authkey.created",
    afterJson: { tag, reusable },
  });

  revalidatePath("/network");
  return key;
}
