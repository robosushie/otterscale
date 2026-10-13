package db

import (
	"context"
	"fmt"

	"github.com/pressly/goose/v3"
	"otterscale/core/migrations"
)

func Migrate(ctx context.Context, database *DB) error {
	var dialect, dir string
	switch database.Dialect {
	case "postgres":
		goose.SetBaseFS(migrations.PostgresFS())
		dir = "postgres"
		dialect = "postgres"
	default:
		goose.SetBaseFS(migrations.SQLiteFS())
		dir = "sqlite"
		dialect = "sqlite3"
	}
	if err := goose.SetDialect(dialect); err != nil {
		return err
	}
	if err := goose.UpContext(ctx, database.DB, dir); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}
