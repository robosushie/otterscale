import { auth } from "@/lib/auth";
import { requireCapability } from "@/lib/authz/load-context";
import { getDefaultOrganization } from "@/lib/org/singleton";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  await requireCapability(session.user.id, "audit.export");
  const org = await getDefaultOrganization();
  const events = await prisma.auditEvent.findMany({
    where: { organizationId: org.id },
    orderBy: { createdAt: "asc" },
  });

  const lines = events.map((e) => JSON.stringify(e)).join("\n");
  return new Response(lines, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": 'attachment; filename="audit.jsonl"',
    },
  });
}
