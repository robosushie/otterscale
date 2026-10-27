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

func TestSessionStoresVerifierHash(t *testing.T) {
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
	userID := id.New()
	now := time.Now().UTC()
	if _, err := database.Exec(ctx, `INSERT INTO "User" ("id","username","email","totpEnabled","createdAt","updatedAt") VALUES (?,?,?,?,?,?)`,
		userID, "session.user", "session@example.com", false, now, now); err != nil {
		t.Fatal(err)
	}
	cookie, err := st.CreateSession(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	sessionID, verifier, ok := strings.Cut(cookie, ".")
	if !ok {
		t.Fatalf("cookie %q", cookie)
	}
	var stored string
	if err := database.QueryRow(ctx, `SELECT "sessionToken" FROM "Session" WHERE "id"=?`, sessionID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == cookie || stored == verifier || stored != auth.TokenHash(verifier) {
		t.Fatal("session secret must be stored as a hash")
	}
	got, err := st.UserIDForSession(ctx, cookie)
	if err != nil || got != userID {
		t.Fatalf("session user %q %v", got, err)
	}
	if _, err := st.UserIDForSession(ctx, sessionID+"."+verifier+"x"); err == nil {
		t.Fatal("wrong verifier should not authenticate")
	}
	if err := st.DeleteSession(ctx, sessionID+"."+verifier+"x"); err == nil {
		t.Fatal("wrong verifier should not delete the session")
	}
	if err := st.DeleteSession(ctx, cookie); err != nil {
		t.Fatal(err)
	}
	if _, err := st.UserIDForSession(ctx, cookie); err == nil {
		t.Fatal("deleted session should not authenticate")
	}
}
