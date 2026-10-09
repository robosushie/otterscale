/*
  Warnings:

  - You are about to drop the `Environment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `environmentId` on the `AccessRule` table. All the data in the column will be lost.
  - You are about to drop the column `environmentId` on the `Group` table. All the data in the column will be lost.
  - You are about to drop the column `environmentId` on the `TenantMembership` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Environment_organizationId_tag_key";

-- DropIndex
DROP INDEX "Environment_organizationId_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Environment";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "aclTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "headscaleNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL DEFAULT '',
    "ipAddresses" TEXT NOT NULL DEFAULT '[]',
    "lastOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MachineWorkspace" (
    "machineId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    PRIMARY KEY ("machineId", "groupId"),
    CONSTRAINT "MachineWorkspace_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MachineWorkspace_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MachineTag" (
    "machineId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("machineId", "tagId"),
    CONSTRAINT "MachineTag_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MachineTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublishedApp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "subdomain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishedApp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PublishedApp_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccessRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tagId" TEXT,
    "ports" TEXT NOT NULL DEFAULT '*',
    "action" TEXT NOT NULL DEFAULT 'accept',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccessRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessRule_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AccessRule" ("action", "createdAt", "groupId", "id", "organizationId", "ports", "updatedAt") SELECT "action", "createdAt", "groupId", "id", "organizationId", "ports", "updatedAt" FROM "AccessRule";
DROP TABLE "AccessRule";
ALTER TABLE "new_AccessRule" RENAME TO "AccessRule";
CREATE TABLE "new_AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'SYSTEM',
    "resourceType" TEXT,
    "resourceId" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "previousHash" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditEvent" ("action", "actorId", "afterJson", "beforeJson", "createdAt", "eventHash", "id", "ipAddress", "organizationId", "previousHash", "resourceId", "resourceType", "userAgent") SELECT "action", "actorId", "afterJson", "beforeJson", "createdAt", "eventHash", "id", "ipAddress", "organizationId", "previousHash", "resourceId", "resourceType", "userAgent" FROM "AuditEvent";
DROP TABLE "AuditEvent";
ALTER TABLE "new_AuditEvent" RENAME TO "AuditEvent";
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");
CREATE TABLE "new_Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Group_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Group" ("createdAt", "id", "name", "organizationId", "updatedAt") SELECT "createdAt", "id", "name", "organizationId", "updatedAt" FROM "Group";
DROP TABLE "Group";
ALTER TABLE "new_Group" RENAME TO "Group";
CREATE UNIQUE INDEX "Group_organizationId_name_key" ON "Group"("organizationId", "name");
CREATE TABLE "new_OrganizationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "headscalePublicUrl" TEXT,
    "headscaleInternalUrl" TEXT,
    "relayMapUrl" TEXT,
    "superAdminsImplicitTenantAdmin" BOOLEAN NOT NULL DEFAULT true,
    "appsBaseDomain" TEXT NOT NULL DEFAULT 'apps.localhost',
    "defaultAuthKeyExpiryHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OrganizationSettings" ("createdAt", "headscaleInternalUrl", "headscalePublicUrl", "id", "organizationId", "relayMapUrl", "setupComplete", "superAdminsImplicitTenantAdmin", "updatedAt") SELECT "createdAt", "headscaleInternalUrl", "headscalePublicUrl", "id", "organizationId", "relayMapUrl", "setupComplete", "superAdminsImplicitTenantAdmin", "updatedAt" FROM "OrganizationSettings";
DROP TABLE "OrganizationSettings";
ALTER TABLE "new_OrganizationSettings" RENAME TO "OrganizationSettings";
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");
CREATE TABLE "new_TenantMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TenantMembership" ("createdAt", "id", "role", "userId") SELECT "createdAt", "id", "role", "userId" FROM "TenantMembership";
DROP TABLE "TenantMembership";
ALTER TABLE "new_TenantMembership" RENAME TO "TenantMembership";
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_userId_groupId_key" ON "WorkspaceMembership"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_slug_key" ON "Tag"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_organizationId_aclTag_key" ON "Tag"("organizationId", "aclTag");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_headscaleNodeId_key" ON "Machine"("headscaleNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishedApp_organizationId_subdomain_key" ON "PublishedApp"("organizationId", "subdomain");
