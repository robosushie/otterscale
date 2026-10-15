package engine

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"otterscale/client/internal/config"
)

type fakeRunner struct {
	found   map[string]string
	runs    []recorded
	started []recorded
	stderr  string
	runErr  error
}

type recorded struct {
	name string
	args []string
}

func (f *fakeRunner) Find(names []string) (string, error) {
	for _, name := range names {
		if path, ok := f.found[name]; ok {
			return path, nil
		}
	}
	return "", errors.New("missing " + names[0])
}

func (f *fakeRunner) Run(ctx context.Context, name string, args []string) (string, string, error) {
	f.runs = append(f.runs, recorded{name: name, args: append([]string{}, args...)})
	return "", f.stderr, f.runErr
}

func (f *fakeRunner) Start(name string, args []string) error {
	f.started = append(f.started, recorded{name: name, args: append([]string{}, args...)})
	return nil
}

func TestUpWithAuthKeyLogsOutThenJoinsAndDoesNotStoreKey(t *testing.T) {
	dir := t.TempDir()
	runner := &fakeRunner{
		found: map[string]string{"tailscale": "tailscale", "tailscaled": "tailscaled"},
	}
	e := &Engine{
		Dir:    dir,
		runner: runner,
		probe:  func(context.Context, string) bool { return true },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	const secret = "tskey-auth-secret"
	err := e.Up(context.Background(), UpOptions{
		AuthKey:     secret,
		LoginServer: "http://127.0.0.1:8080",
		Hostname:    "laptop",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(runner.started) != 0 {
		t.Fatalf("attached daemon should not be started again: %#v", runner.started)
	}
	if len(runner.runs) != 2 {
		t.Fatalf("runs %#v", runner.runs)
	}
	if runner.runs[0].args[0] != "logout" {
		t.Fatalf("first command %#v", runner.runs[0])
	}
	joined := strings.Join(runner.runs[1].args, " ")
	for _, want := range []string{"up", "--login-server=http://127.0.0.1:8080", "--auth-key=" + secret, "--hostname=laptop"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("args %s missing %s", joined, want)
		}
	}
	raw, err := os.ReadFile(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), secret) {
		t.Fatalf("auth key was stored: %s", raw)
	}
	if !strings.Contains(string(raw), "http://127.0.0.1:8080") || !strings.Contains(string(raw), "laptop") {
		t.Fatalf("settings were not saved: %s", raw)
	}
}

func TestUpWithoutKeyDoesNotLogout(t *testing.T) {
	runner := &fakeRunner{found: map[string]string{"tailscale": "tailscale"}}
	e := &Engine{
		Dir:    t.TempDir(),
		runner: runner,
		probe:  func(context.Context, string) bool { return true },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	if err := e.save(config.File{LoginServer: "https://hs.example"}); err != nil {
		t.Fatal(err)
	}
	if err := e.Up(context.Background(), UpOptions{}); err != nil {
		t.Fatal(err)
	}
	if len(runner.runs) != 1 || runner.runs[0].args[0] != "up" {
		t.Fatalf("runs %#v", runner.runs)
	}
	if strings.Contains(strings.Join(runner.runs[0].args, " "), "auth-key") {
		t.Fatalf("reconnect must not send an auth key: %#v", runner.runs[0].args)
	}
}

func TestUpRedactsKeyAndExplainsPrivilege(t *testing.T) {
	runner := &fakeRunner{
		found:  map[string]string{"tailscale": "tailscale"},
		stderr: "Access is denied for tskey-auth-secret",
		runErr: errors.New("exit status 1"),
	}
	e := &Engine{
		Dir:    t.TempDir(),
		runner: runner,
		probe:  func(context.Context, string) bool { return true },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	err := e.Up(context.Background(), UpOptions{AuthKey: "tskey-auth-secret", LoginServer: "https://hs.example"})
	if err == nil {
		t.Fatal("expected error")
	}
	msg := err.Error()
	if strings.Contains(msg, "tskey-auth-secret") {
		t.Fatalf("secret leaked: %s", msg)
	}
	if !strings.Contains(msg, "[redacted]") || !strings.Contains(msg, "administrator") {
		t.Fatalf("message %s", msg)
	}
}

func TestEnsureStartsDaemonWhenNoneIsRunning(t *testing.T) {
	dir := t.TempDir()
	probes := 0
	runner := &fakeRunner{found: map[string]string{"tailscaled": "tailscaled"}}
	e := &Engine{
		Dir:    dir,
		runner: runner,
		probe: func(context.Context, string) bool {
			probes++
			return probes > 3
		},
		read: func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := e.Ensure(ctx); err != nil {
		t.Fatal(err)
	}
	if len(runner.started) != 1 {
		t.Fatalf("started %#v", runner.started)
	}
	joined := strings.Join(runner.started[0].args, " ")
	if !strings.Contains(joined, "--state=") || !strings.Contains(joined, "--socket=") {
		t.Fatalf("daemon args %s", joined)
	}
	if err := e.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(runner.started) != 1 {
		t.Fatal("second ensure started another daemon")
	}
}

func TestStatusDoesNotStartDaemon(t *testing.T) {
	runner := &fakeRunner{}
	e := &Engine{
		Dir:    t.TempDir(),
		runner: runner,
		probe:  func(context.Context, string) bool { return false },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	st, err := e.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st.DaemonRunning || len(runner.started) != 0 {
		t.Fatalf("status %#v started %#v", st, runner.started)
	}
	if st.Message == "" {
		t.Fatal("expected a not-running message")
	}
}
