package db

import (
	"context"
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
