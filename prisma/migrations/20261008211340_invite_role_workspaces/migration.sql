-- AlterTable
ALTER TABLE "UserInvite" ADD COLUMN "platformRole" TEXT;

-- CreateTable
CREATE TABLE "UserInviteWorkspace" (
    "inviteId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    PRIMARY KEY ("inviteId", "groupId"),
    CONSTRAINT "UserInviteWorkspace_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "UserInvite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserInviteWorkspace_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
