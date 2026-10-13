package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib"
	_ "modernc.org/sqlite"
)

const DefaultFileName = "otterscale.db"

type DB struct {
	*sql.DB
	Dialect string
}

func Open(ctx context.Context, rawURL, dataDir string) (*DB, error) {
	cfg, err := Parse(rawURL, dataDir)
	if err != nil {
		return nil, err
	}
	sqlDB, err := sql.Open(cfg.driver, cfg.dsn)
	if err != nil {
		return nil, err
	}
	if cfg.driver == "sqlite" {
		// Nested reads happen while a result set is still open. WAL plus busy_timeout
		// keeps a single writer safe without stalling those reads.
		sqlDB.SetMaxOpenConns(8)
	}
	if err := sqlDB.PingContext(ctx); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return &DB{DB: sqlDB, Dialect: cfg.dialect}, nil
}

type parsed struct {
	driver  string
	dialect string
	dsn     string
}

func Parse(rawURL, dataDir string) (parsed, error) {
	raw := strings.TrimSpace(rawURL)
	if raw == "" {
		if strings.TrimSpace(dataDir) == "" {
			dataDir = "/data"
		}
		if err := os.MkdirAll(dataDir, 0o755); err != nil {
			return parsed{}, fmt.Errorf("create data dir: %w", err)
		}
		path := filepath.Join(dataDir, DefaultFileName)
		return sqliteFile(path), nil
	}
	lower := strings.ToLower(raw)
	switch {
	case strings.HasPrefix(lower, "postgres://"), strings.HasPrefix(lower, "postgresql://"):
		return parsed{driver: "pgx", dialect: "postgres", dsn: raw}, nil
	case strings.HasPrefix(lower, "file:"), strings.HasPrefix(lower, "sqlite:"):
		path, err := sqlitePath(raw)
		if err != nil {
			return parsed{}, err
		}
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return parsed{}, fmt.Errorf("create sqlite dir: %w", err)
		}
		return sqliteFile(path), nil
	default:
		return parsed{}, fmt.Errorf("unsupported DATABASE_URL scheme")
	}
}

func sqlitePath(raw string) (string, error) {
	rest := raw
	switch {
	case strings.HasPrefix(strings.ToLower(raw), "sqlite:"):
		rest = raw[len("sqlite:"):]
	case strings.HasPrefix(strings.ToLower(raw), "file:"):
		rest = raw[len("file:"):]
	}
	if i := strings.Index(rest, "?"); i >= 0 {
		rest = rest[:i]
	}
	rest = strings.TrimSpace(rest)
	if rest == "" {
		return "", fmt.Errorf("sqlite DATABASE_URL is missing a path")
	}
	if strings.HasPrefix(rest, "//") {
		u, err := url.Parse("file:" + rest)
		if err != nil {
			return "", err
		}
		return u.Path, nil
	}
	return filepath.Clean(rest), nil
}

func sqliteFile(path string) parsed {
	dsn := "file:" + filepath.ToSlash(path) + "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)"
	return parsed{driver: "sqlite", dialect: "sqlite", dsn: dsn}
}

func (d *DB) Rebind(query string) string {
	if d.Dialect != "postgres" {
		return query
	}
	var b strings.Builder
	n := 1
	for _, r := range query {
		if r == '?' {
			fmt.Fprintf(&b, "$%d", n)
			n++
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func (d *DB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return d.DB.ExecContext(ctx, d.Rebind(query), args...)
}

func (d *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return d.DB.QueryContext(ctx, d.Rebind(query), args...)
}

func (d *DB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return d.DB.QueryRowContext(ctx, d.Rebind(query), args...)
}
