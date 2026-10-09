import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const LEGACY_ROLE_UPDATES = [
  `UPDATE "TenantMembership" SET "role" = 'ADMIN' WHERE "role" IN ('TENANT_ADMIN', 'NET_ADMIN')`,
  `UPDATE "TenantMembership" SET "role" = 'MEMBER' WHERE "role" NOT IN ('ADMIN', 'MEMBER')`,
  `UPDATE "WorkspaceMembership" SET "role" = 'ADMIN' WHERE "role" IN ('TENANT_ADMIN', 'NET_ADMIN')`,
  `UPDATE "WorkspaceMembership" SET "role" = 'MEMBER' WHERE "role" NOT IN ('ADMIN', 'MEMBER')`,
  `UPDATE "UserInvite" SET "tenantRole" = 'ADMIN' WHERE "tenantRole" IN ('TENANT_ADMIN', 'NET_ADMIN')`,
  `UPDATE "UserInvite" SET "tenantRole" = 'MEMBER' WHERE "tenantRole" NOT IN ('ADMIN', 'MEMBER')`,
];

async function prepareSqlite(client: PrismaClient) {
  try {
    await client.$queryRawUnsafe("PRAGMA journal_mode=WAL");
  } catch (error) {
    console.error("SQLite WAL pragma failed", error);
  }

  for (const sql of LEGACY_ROLE_UPDATES) {
    try {
      await client.$executeRawUnsafe(sql);
    } catch (error) {
      console.error("Legacy role rewrite failed", error);
    }
  }
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  const ready = client.$connect().then(() => prepareSqlite(client));
  return { client, ready };
}

const created = globalForPrisma.prisma
  ? { client: globalForPrisma.prisma, ready: Promise.resolve() }
  : createPrismaClient();

export const prisma = created.client;

/** Resolves after legacy TenantRole values have been rewritten. */
export const sqliteReady = created.ready;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
