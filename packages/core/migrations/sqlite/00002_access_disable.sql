-- +goose Up
ALTER TABLE "User" ADD COLUMN "loginDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Machine" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE "Machine" DROP COLUMN "disabled";
ALTER TABLE "User" DROP COLUMN "loginDisabled";
