package cli

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"otterscale/client/internal/config"
	"otterscale/client/internal/engine"
)

type fakeService struct {
	file   config.File
	status engine.Status
	err    error
	up     engine.UpOptions
}

func (f *fakeService) Show() (config.File, error) { return f.file, f.err }
func (f *fakeService) Set(key, value string) error {
	return config.Apply(&f.file, key, value)
}
func (f *fakeService) Up(_ context.Context, authKey, loginServer, hostname string) error {
	f.up = engine.UpOptions{AuthKey: authKey, LoginServer: loginServer, Hostname: hostname}
	return f.err
}
func (f *fakeService) Status(context.Context) (engine.Status, error) { return f.status, f.err }
func (f *fakeService) Down(context.Context) error                    { return f.err }
func (f *fakeService) Logout(context.Context) error                  { return f.err }

func TestConfigSetShowAndRejectsMissingAuthKey(t *testing.T) {
	svc := &fakeService{}
	var out, err bytes.Buffer
	if code := Run([]string{"config", "set", "login-server", "http://127.0.0.1:8080"}, &out, &err, svc); code != 0 {
		t.Fatalf("set code %d %s", code, err.String())
	}
	out.Reset()
	if code := Run([]string{"config", "show"}, &out, &err, svc); code != 0 {
		t.Fatal(err.String())
	}
	if !strings.Contains(out.String(), "login-server: http://127.0.0.1:8080") {
		t.Fatalf("show %s", out.String())
	}
	err.Reset()
	if code := Run([]string{"up"}, &out, &err, svc); code != 2 {
		t.Fatalf("up code %d", code)
	}
	if !strings.Contains(err.String(), "--auth-key") {
		t.Fatalf("stderr %s", err.String())
	}
}

func TestUpPassesFlagsWithoutPrintingTheKey(t *testing.T) {
	svc := &fakeService{}
	var out, err bytes.Buffer
	code := Run([]string{"up", "--auth-key", "tskey-auth-secret", "--login-server", "https://hs.example", "--hostname", "pi"}, &out, &err, svc)
	if code != 0 {
		t.Fatalf("code %d %s", code, err.String())
	}
	if svc.up.AuthKey != "tskey-auth-secret" || svc.up.LoginServer != "https://hs.example" || svc.up.Hostname != "pi" {
		t.Fatalf("opts %#v", svc.up)
	}
	if strings.Contains(out.String(), "tskey-auth-secret") {
		t.Fatalf("stdout leaked the key: %s", out.String())
	}
}

func TestStatusFormat(t *testing.T) {
	text := FormatStatus(engine.Status{
		DaemonRunning: true,
		BackendState:  "Running",
		Hostname:      "pi",
		Addresses:     []string{"100.64.0.2"},
		LoginServer:   "https://hs.example",
	})
	if !strings.Contains(text, "Daemon: running") || !strings.Contains(text, "100.64.0.2") || !strings.Contains(text, "https://hs.example") {
		t.Fatalf("status %s", text)
	}
}
