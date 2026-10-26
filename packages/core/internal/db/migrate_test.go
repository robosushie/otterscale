package db

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMigrateCreatesUserTable(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := database.QueryRow(ctx, `SELECT COUNT(*) FROM "User"`).Scan(&n); err != nil {
		t.Fatal(err)
	}
}

func TestDefaultWorkspaceMigrationCopiesMembers(t *testing.T) {
	ctx := context.Background()
	database, err := Open(ctx, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	now := "2026-01-01T00:00:00Z"
	if _, err := database.Exec(ctx, `INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "org1", "Otterscale", "default", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "user1", "owner", "owner@example.com", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "Group" ("id","organizationId","name","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "g-old", "org1", "platform-admins", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "GroupMember" ("id","groupId","userId","email","createdAt") VALUES (?,?,?,?,?)`, "m1", "g-old", "user1", "owner@example.com", now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "WorkspaceMembership" ("id","userId","groupId","role","createdAt") VALUES (?,?,?,?,?)`, "wm1", "user1", "g-old", "ADMIN", now); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("..", "..", "migrations", "sqlite", "00004_default_workspaces.sql"))
	if err != nil {
		t.Fatal(err)
	}
	up, _, _ := strings.Cut(string(raw), "-- +goose Down")
	up = strings.TrimPrefix(up, "-- +goose Up")
	for _, statement := range strings.Split(up, ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err := database.Exec(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	var adminID, platformID string
	if err := database.QueryRow(ctx, `SELECT "id" FROM "Group" WHERE "organizationId"=? AND "name"='admin'`, "org1").Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	if adminID != "g-old" {
		t.Fatalf("admin id %s", adminID)
	}
	if err := database.QueryRow(ctx, `SELECT "id" FROM "Group" WHERE "organizationId"=? AND "name"='platform'`, "org1").Scan(&platformID); err != nil {
		t.Fatal(err)
	}
	var members, memberships int
	if err := database.QueryRow(ctx, `SELECT COUNT(*) FROM "GroupMember" WHERE "groupId"=? AND "email"=?`, platformID, "owner@example.com").Scan(&members); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow(ctx, `SELECT COUNT(*) FROM "WorkspaceMembership" WHERE "userId"=? AND "groupId"=? AND "role"='ADMIN'`, "user1", platformID).Scan(&memberships); err != nil {
		t.Fatal(err)
	}
	if members != 1 || memberships != 1 {
		t.Fatalf("members %d memberships %d", members, memberships)
	}
}
