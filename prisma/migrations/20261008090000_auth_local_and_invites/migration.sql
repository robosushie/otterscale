-- AlterTable
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

UPDATE "User" SET "username" = LOWER(REGEXP_REPLACE(SPLIT_PART("email", '@', 1), '[^a-zA-Z0-9._-]', '_', 'g')) || '_' || SUBSTRING("id", 1, 6)
WHERE "username" IS NULL;

UPDATE "User" SET "username" = 'user_' || SUBSTRING("id", 1, 8)
WHERE "username" IS NULL OR LENGTH("username") < 3;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "tenantRole" "TenantRole" NOT NULL DEFAULT 'MEMBER',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserInvite_organizationId_email_idx" ON "UserInvite"("organizationId", "email");

ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
