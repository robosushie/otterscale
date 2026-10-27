-- +goose Up
CREATE TABLE IF NOT EXISTS "DeviceCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machineId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceCredential_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceCredential_tokenHash_key" ON "DeviceCredential"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceCredential_machineId_key" ON "DeviceCredential"("machineId");

-- +goose Down
DROP TABLE IF EXISTS "DeviceCredential";
