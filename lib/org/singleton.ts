import { prisma } from "@/lib/db";

export async function getDefaultOrganization() {
  let org = await prisma.organization.findFirst({
    include: { settings: true },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Otterscale",
        slug: "default",
        settings: {
          create: {
            setupComplete: false,
            superAdminsImplicitTenantAdmin: true,
          },
        },
      },
      include: { settings: true },
    });
  }
  return org;
}
