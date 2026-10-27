-- +goose Up
ALTER TABLE "UserInvite" ADD COLUMN "codeSelector" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "UserInvite_codeSelector_key" ON "UserInvite"("codeSelector") WHERE "codeSelector" IS NOT NULL;
UPDATE "UserInvite" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "redeemedAt" IS NULL AND "revokedAt" IS NULL AND "codeSelector" IS NULL;

DELETE FROM "Session";

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformMembership_one_owner" ON "PlatformMembership"("role") WHERE "role" = 'OWNER';

ALTER TABLE "AuditEvent" ADD COLUMN "hashEpoch" INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE "AuditEvent" DROP COLUMN "hashEpoch";
DROP INDEX IF EXISTS "PlatformMembership_one_owner";
DROP INDEX IF EXISTS "UserInvite_codeSelector_key";
ALTER TABLE "UserInvite" DROP COLUMN "codeSelector";
