package store

import (
	"context"
	"testing"
	"time"

	"otterscale/core/internal/auth"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
)

func TestInviteRedeem(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, "", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := db.Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	st := New(database)
	org, err := st.DefaultOrg(ctx)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	actor := id.New()
	hash, err := auth.HashPassword("owner-password")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","passwordHash","totpEnabled","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)`,
		actor, "owner", "owner@example.com", hash, true, now, now); err != nil {
		t.Fatal(err)
	}
	code, _, _, err := st.CreateInvite(ctx, actor, "new@example.com", "new.user", "MEMBER", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	invite, err := st.FindInviteByCode(ctx, code)
	if err != nil {
		t.Fatal(err)
	}
	if invite.Email != "new@example.com" || invite.OrganizationID != org.ID {
		t.Fatalf("invite %#v", invite)
	}
	userID := id.New()
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","passwordHash","totpEnabled","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)`,
		userID, "new.user", "new@example.com", hash, true, now, now); err != nil {
		t.Fatal(err)
	}
	if err := st.ApplyInvite(ctx, userID, "new@example.com", invite); err != nil {
		t.Fatal(err)
	}
	if _, err := st.FindInviteByCode(ctx, code); err == nil {
		t.Fatal("redeemed invite should not match again")
	}
}
