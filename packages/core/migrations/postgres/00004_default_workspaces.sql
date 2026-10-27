-- +goose Up
-- The default workspace was platform-admins. Keep those members on admin, and
-- give every organisation a platform workspace with the same people.
UPDATE "Group" AS old
SET "name" = 'admin', "updatedAt" = CURRENT_TIMESTAMP
WHERE old."name" = 'platform-admins'
  AND NOT EXISTS (
    SELECT 1 FROM "Group" AS existing
    WHERE existing."organizationId" = old."organizationId"
      AND existing."name" = 'admin'
  );

INSERT INTO "Group" ("id", "organizationId", "name", "createdAt", "updatedAt")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || o."id"), 1, 24), o."id", 'platform', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
WHERE NOT EXISTS (
  SELECT 1 FROM "Group" g WHERE g."organizationId" = o."id" AND g."name" = 'platform'
);

INSERT INTO "GroupMember" ("id", "groupId", "userId", "email", "createdAt")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || adminMember."id"), 1, 24), platform."id", adminMember."userId", adminMember."email", CURRENT_TIMESTAMP
FROM "Group" admin
JOIN "Group" platform ON platform."organizationId" = admin."organizationId" AND platform."name" = 'platform'
JOIN "GroupMember" adminMember ON adminMember."groupId" = admin."id"
WHERE admin."name" = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM "GroupMember" existing
    WHERE existing."groupId" = platform."id" AND existing."email" = adminMember."email"
  );

INSERT INTO "WorkspaceMembership" ("id", "userId", "groupId", "role", "createdAt")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || adminMembership."id"), 1, 24), adminMembership."userId", platform."id", adminMembership."role", CURRENT_TIMESTAMP
FROM "Group" admin
JOIN "Group" platform ON platform."organizationId" = admin."organizationId" AND platform."name" = 'platform'
JOIN "WorkspaceMembership" adminMembership ON adminMembership."groupId" = admin."id"
WHERE admin."name" = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM "WorkspaceMembership" existing
    WHERE existing."userId" = adminMembership."userId" AND existing."groupId" = platform."id"
  );

-- +goose Down
DELETE FROM "Group" WHERE "name" = 'platform';
UPDATE "Group" SET "name" = 'platform-admins', "updatedAt" = CURRENT_TIMESTAMP WHERE "name" = 'admin';
