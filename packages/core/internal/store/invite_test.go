package store

import (
	"context"
	"strings"
	"testing"
	"time"

	"otterscale/core/internal/auth"
	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
)

func TestInviteRedeem(t *testing.T) {
	t.Setenv("AUTH_SECRET", strings.Repeat("s", 32))
	t.Setenv("OTTERSCALE_DATA_DIR", t.TempDir())
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
	selector, verifier, ok := strings.Cut(code, ".")
	if !ok || selector == "" || verifier == "" {
		t.Fatalf("code %q", code)
	}
	var stored string
	if err := database.QueryRow(ctx, `SELECT "codeHash" FROM "UserInvite" WHERE "codeSelector"=?`, selector).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == verifier || stored != auth.TokenHash(verifier) {
		t.Fatal("invite verifier must be stored as a hash")
	}
	if _, err := st.FindInviteByCode(ctx, selector+"."+verifier+"x"); err == nil {
		t.Fatal("wrong code should not match")
	}
	now = time.Now().UTC()
	if _, err := database.Exec(ctx, `INSERT INTO "UserInvite" ("id","organizationId","email","username","codeHash","tenantRole","createdById","expiresAt","createdAt","revokedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`,
		id.New(), org.ID, "old@example.com", "old.user", "$argon2id$v=19$m=1,t=1,p=1$aa$bb", "MEMBER", actor, now.Add(time.Hour), now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := st.FindInviteByCode(ctx, "legacy.verifier"); err == nil {
		t.Fatal("revoked pre-migration invite should not match")
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
