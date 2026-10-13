package db

import (
	"path/filepath"
	"testing"
)

func TestParseEmptyCreatesSQLiteFileURL(t *testing.T) {
	dir := t.TempDir()
	got, err := Parse("", dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.dialect != "sqlite" || got.driver != "sqlite" {
		t.Fatalf("dialect=%s driver=%s", got.dialect, got.driver)
	}
	if !contains(got.dsn, filepath.ToSlash(filepath.Join(dir, DefaultFileName))) {
		t.Fatalf("dsn %s", got.dsn)
	}
}

func TestParsePostgresAndSQLite(t *testing.T) {
	pg, err := Parse("postgres://user:pass@localhost:5432/otter", "")
	if err != nil || pg.dialect != "postgres" {
		t.Fatalf("postgres: %+v %v", pg, err)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "otterscale.db")
	file, err := Parse("file:"+filepath.ToSlash(path), "")
	if err != nil || file.dialect != "sqlite" {
		t.Fatalf("file: %+v %v", file, err)
	}
	if !contains(file.dsn, filepath.ToSlash(path)) {
		t.Fatalf("dsn %s", file.dsn)
	}
	if _, err := Parse("mysql://localhost/otter", ""); err == nil {
		t.Fatal("mysql should fail")
	}
}

func contains(s, part string) bool {
	return len(part) > 0 && (s == part || len(s) >= len(part) && (indexOf(s, part) >= 0))
}

func indexOf(s, part string) int {
	for i := 0; i+len(part) <= len(s); i++ {
		if s[i:i+len(part)] == part {
			return i
		}
	}
	return -1
}
