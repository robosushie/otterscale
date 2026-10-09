import { createHash } from "crypto";
import { AuditCategory } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AuditPayload = {
  organizationId: string;
  actorId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  ipAddress?: string;
  userAgent?: string;
  category?: AuditCategory;
};

function hashEvent(previousHash: string, payload: string): string {
  return createHash("sha256").update(previousHash + payload).digest("hex");
}

export async function appendAuditEvent(input: AuditPayload): Promise<void> {
  const last = await prisma.auditEvent.findFirst({
    where: { organizationId: input.organizationId },
    orderBy: { createdAt: "desc" },
    select: { eventHash: true },
  });
  const previousHash = last?.eventHash ?? "genesis";

  const canonical = JSON.stringify({
    action: input.action,
    actorId: input.actorId ?? null,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    before: input.beforeJson ?? null,
    after: input.afterJson ?? null,
    at: new Date().toISOString(),
  });

  const eventHash = hashEvent(previousHash, canonical);

  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      category: input.category ?? AuditCategory.SYSTEM,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      beforeJson: input.beforeJson ? JSON.stringify(input.beforeJson) : null,
      afterJson: input.afterJson ? JSON.stringify(input.afterJson) : null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      previousHash,
      eventHash,
    },
  });
}
