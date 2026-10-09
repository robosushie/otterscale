-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Machine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "headscaleNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL DEFAULT '',
    "ipAddresses" TEXT NOT NULL DEFAULT '[]',
    "lastOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Machine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Machine" ("createdAt", "headscaleNodeId", "hostname", "id", "ipAddresses", "lastOnline", "lastSeenAt", "name", "organizationId", "updatedAt") SELECT "createdAt", "headscaleNodeId", "hostname", "id", "ipAddresses", "lastOnline", "lastSeenAt", "name", "organizationId", "updatedAt" FROM "Machine";
DROP TABLE "Machine";
ALTER TABLE "new_Machine" RENAME TO "Machine";
CREATE UNIQUE INDEX "Machine_headscaleNodeId_key" ON "Machine"("headscaleNodeId");
CREATE TABLE "new_PublishedApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "subdomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishedApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PublishedApp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PublishedApp_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PublishedApp" ("createdAt", "id", "lastError", "machineId", "organizationId", "port", "status", "subdomain", "updatedAt") SELECT "createdAt", "id", "lastError", "machineId", "organizationId", "port", "status", "subdomain", "updatedAt" FROM "PublishedApp";
DROP TABLE "PublishedApp";
ALTER TABLE "new_PublishedApp" RENAME TO "PublishedApp";
CREATE UNIQUE INDEX "PublishedApp_organizationId_subdomain_key" ON "PublishedApp"("organizationId", "subdomain");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
