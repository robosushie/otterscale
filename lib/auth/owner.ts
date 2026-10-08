import { PlatformRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function hasOwner(): Promise<boolean> {
  const owner = await prisma.platformMembership.findFirst({
    where: { role: PlatformRole.OWNER },
  });
  return owner !== null;
}
