package audit

import (
	"context"
	"strings"
	"testing"
	"time"

	"otterscale/core/internal/db"
	"otterscale/core/internal/id"
)

func TestAuditHMACChain(t *testing.T) {
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
	orgID := id.New()
	now := time.Now().UTC()
	if _, err := database.Exec(ctx, `INSERT INTO "Organization" ("id","name","slug","createdAt","updatedAt") VALUES (?,?,?,?,?)`, orgID, "Otterscale", "default", now, now); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `INSERT INTO "AuditEvent" ("id","organizationId","action","category","previousHash","eventHash","createdAt","hashEpoch") VALUES (?,?,?,?,?,?,?,?)`,
		"epoch0", orgID, "legacy", "SYSTEM", "genesis", "legacy-hash", now.Add(-time.Minute), 0); err != nil {
		t.Fatal(err)
	}
	if err := Append(ctx, database, orgID, "", "member.invited", "SYSTEM", "user_invite", "invite-1", map[string]string{"email": "a@example.com"}); err != nil {
		t.Fatal(err)
	}
	if err := Append(ctx, database, orgID, "", "member.invited", "SYSTEM", "user_invite", "invite-2", nil); err != nil {
		t.Fatal(err)
	}
	if err := Verify(ctx, database, orgID); err != nil {
		t.Fatal(err)
	}
	if err := CheckTip(ctx, database); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(ctx, `UPDATE "AuditEvent" SET "afterJson"=? WHERE "resourceId"=?`, `{"email":"tampered"}`, "invite-1"); err != nil {
		t.Fatal(err)
	}
	if err := Verify(ctx, database, orgID); err == nil {
		t.Fatal("tampered payload should fail verification")
	}
}
