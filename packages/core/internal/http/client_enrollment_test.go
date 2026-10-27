package httpapi

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"otterscale/core/internal/db"
	"otterscale/core/internal/store"
)

func TestEnrollmentAssignsOwnerOnce(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if _, err := database.Exec(ctx, `INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "org1", "Otterscale", "default", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "user1", "owner", "owner@example.com", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","createdAt","updatedAt") VALUES (?,?,?,?,?)`, "user2", "other", "other@example.com", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "Machine" ("id","organizationId","headscaleNodeId","name","createdAt","updatedAt") VALUES (?,?,?,?,?,?)`, "mach1", "org1", "node1", "robosushie", now, now); err != nil {
		t.Fatal(err)
	}
	api := &API{Store: store.New(database)}
	secret, err := api.mintEnrollment(ctx, "org1", "user1", now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	owner, err := api.pendingEnrollment(ctx, secret, now)
	if err != nil || owner != "user1" {
		t.Fatalf("owner %q err %v", owner, err)
	}
	if err := assignCreator(ctx, database, "mach1", owner); err != nil {
		t.Fatal(err)
	}
	if err := assignCreator(ctx, database, "mach1", "user2"); err != nil {
		t.Fatal(err)
	}
	var creator string
	if err := database.QueryRow(ctx, `SELECT "createdById" FROM "Machine" WHERE "id"=?`, "mach1").Scan(&creator); err != nil {
		t.Fatal(err)
	}
	if creator != "user1" {
		t.Fatalf("creator %q", creator)
	}
	if err := api.finishEnrollment(ctx, secret, now); err != nil {
		t.Fatal(err)
	}
	if err := api.finishEnrollment(ctx, secret, now); err == nil || !strings.Contains(err.Error(), "already") {
		t.Fatalf("second use %v", err)
	}
	expired, err := api.mintEnrollment(ctx, "org1", "user1", now.Add(-time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := api.pendingEnrollment(ctx, expired, now); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expired %v", err)
	}
	var used sql.NullTime
	if err := database.QueryRow(ctx, `SELECT "usedAt" FROM "DeviceEnrollment" WHERE "tokenHash"=?`, secretHash(secret)).Scan(&used); err != nil {
		t.Fatal(err)
	}
	if !used.Valid {
		t.Fatal("enrollment was not consumed")
	}
}
