package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	in := File{ConsoleURL: "https://console.example", LoginServer: "http://127.0.0.1:8080", Hostname: "pi-1"}
	if err := SaveTo(dir, in); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "tskey") || strings.Contains(string(raw), "authKey") {
		t.Fatalf("config must not grow an auth key field: %s", raw)
	}
	got, err := LoadFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != in {
		t.Fatalf("got %#v", got)
	}
}

func TestLoadMissing(t *testing.T) {
	got, err := LoadFrom(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if got != (File{}) {
		t.Fatalf("got %#v", got)
	}
}

func TestApplyRejectsAuthKeyAndBadURL(t *testing.T) {
	file := File{}
	if err := Apply(&file, "auth-key", "tskey-auth-secret"); err == nil {
		t.Fatal("auth key must not be a stored setting")
	}
	if err := Apply(&file, "login-server", "not a url"); err == nil {
		t.Fatal("expected invalid url")
	}
	if err := Apply(&file, "console-url", "https://console.example"); err != nil {
		t.Fatal(err)
	}
	if file.ConsoleURL != "https://console.example" {
		t.Fatalf("console %#v", file)
	}
}

func TestHostnameRules(t *testing.T) {
	file := File{Hostname: "ok-host"}
	if err := file.Validate(); err != nil {
		t.Fatal(err)
	}
	file.Hostname = "bad host"
	if err := file.Validate(); err == nil {
		t.Fatal("expected hostname error")
	}
}
