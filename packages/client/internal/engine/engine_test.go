package engine

import (
	"context"
	"encoding/json"
	"errors"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"otterscale/client/internal/config"
	"tailscale.com/ipn"
	"tailscale.com/ipn/ipnstate"
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

type fakeMesh struct {
	logoutErr   error
	startErr    error
	editErr     error
	logouts     int
	logins      int
	statusCalls int
	authURL     string
	states      []string
	starts      []ipn.Options
	edits       []*ipn.MaskedPrefs
}

func (f *fakeMesh) EditPrefs(ctx context.Context, mp *ipn.MaskedPrefs) (*ipn.Prefs, error) {
	f.edits = append(f.edits, mp)
	if f.editErr != nil {
		return nil, f.editErr
	}
	return &mp.Prefs, nil
}

func (f *fakeMesh) Logout(context.Context) error {
	f.logouts++
	return f.logoutErr
}

func (f *fakeMesh) StartLoginInteractive(context.Context) error {
	f.logins++
	return nil
}

func (f *fakeMesh) Start(ctx context.Context, opts ipn.Options) error {
	f.starts = append(f.starts, opts)
	return f.startErr
}

func (f *fakeMesh) StatusWithoutPeers(context.Context) (*ipnstate.Status, error) {
	f.statusCalls++
	state := "Running"
	if len(f.states) > 0 {
		state = f.states[0]
		if len(f.states) > 1 {
			f.states = f.states[1:]
		}
	}
	return &ipnstate.Status{BackendState: state, AuthURL: f.authURL}, nil
}

func TestUpWithAuthKeyJoinsAndDoesNotStoreKey(t *testing.T) {
	dir := t.TempDir()
	runner := &fakeRunner{}
	mesh := &fakeMesh{states: []string{"NeedsLogin", "Running"}}
	e := testEngine(dir, runner, mesh)
	const secret = "tskey-auth-secret"
	err := e.Up(context.Background(), UpOptions{
		AuthKey:     secret,
		LoginServer: "http://127.0.0.1:8080",
		Hostname:    "laptop",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(runner.started) != 0 || len(runner.runs) != 0 {
		t.Fatalf("socket join must not run a command: started %#v runs %#v", runner.started, runner.runs)
	}
	if mesh.logouts != 0 || mesh.logins != 1 || len(mesh.starts) != 1 || mesh.statusCalls < 2 {
		t.Fatalf("logout %d login %d starts %d status %d", mesh.logouts, mesh.logins, len(mesh.starts), mesh.statusCalls)
	}
	started := mesh.starts[0]
	if started.AuthKey != secret {
		t.Fatalf("auth key was not sent on the socket")
	}
	prefs := started.UpdatePrefs
	if prefs == nil || prefs.ControlURL != "http://127.0.0.1:8080" || prefs.Hostname != "laptop" || !prefs.WantRunning || prefs.LoggedOut {
		t.Fatalf("prefs %#v", prefs)
	}
	if prefs.RunSSH || len(prefs.AdvertiseRoutes) != 0 {
		t.Fatalf("join prefs enable extra features: %#v", prefs)
	}
	encoded, err := json.Marshal(prefs)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), secret) {
		t.Fatalf("auth key was copied into prefs: %s", encoded)
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
	runner := &fakeRunner{}
	mesh := &fakeMesh{}
	e := testEngine(t.TempDir(), runner, mesh)
	if err := e.save(config.File{LoginServer: "https://hs.example"}); err != nil {
		t.Fatal(err)
	}
	if err := e.Up(context.Background(), UpOptions{}); err != nil {
		t.Fatal(err)
	}
	if mesh.logouts != 0 || mesh.logins != 0 || len(mesh.starts) != 0 || len(runner.runs) != 0 {
		t.Fatalf("reconnect used logout %d login %d starts %d runs %#v", mesh.logouts, mesh.logins, len(mesh.starts), runner.runs)
	}
	if len(mesh.edits) != 1 || !mesh.edits[0].WantRunning || mesh.edits[0].ControlURL != "https://hs.example" {
		t.Fatalf("edits %#v", mesh.edits)
	}
}

func TestUpAuthKeyKeepsPollingWhenHeadscaleSendsABrowserURL(t *testing.T) {
	mesh := &fakeMesh{states: []string{"NeedsLogin"}, authURL: "http://127.0.0.1:8080/register/mkey"}
	e := testEngine(t.TempDir(), &fakeRunner{}, mesh)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	err := e.Up(ctx, UpOptions{AuthKey: "tskey-auth-secret", LoginServer: "https://hs.example"})
	if err == nil || !strings.Contains(err.Error(), "did not accept the auth key") {
		t.Fatalf("error %v", err)
	}
	if mesh.logins != 1 || mesh.statusCalls < 2 {
		t.Fatalf("login %d status %d", mesh.logins, mesh.statusCalls)
	}
}

func TestUpAuthKeyReportsRejectedLogin(t *testing.T) {
	mesh := &fakeMesh{states: []string{"NeedsLogin"}}
	e := testEngine(t.TempDir(), &fakeRunner{}, mesh)
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	err := e.Up(ctx, UpOptions{AuthKey: "tskey-auth-secret", LoginServer: "https://hs.example"})
	if err == nil || !strings.Contains(err.Error(), "did not accept the auth key") {
		t.Fatalf("error %v", err)
	}
	if strings.Contains(err.Error(), "tskey-auth-secret") {
		t.Fatalf("secret leaked: %s", err)
	}
}

func TestUpRedactsKeyAndExplainsPrivilege(t *testing.T) {
	mesh := &fakeMesh{startErr: errors.New("Access is denied for tskey-auth-secret")}
	e := testEngine(t.TempDir(), &fakeRunner{}, mesh)
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
	if mesh.logins != 0 {
		t.Fatal("login continued after start failed")
	}
}

func TestDownAndLogoutUseSocket(t *testing.T) {
	runner := &fakeRunner{}
	mesh := &fakeMesh{}
	e := testEngine(t.TempDir(), runner, mesh)
	if err := e.Down(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := e.Logout(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(runner.runs) != 0 || len(runner.started) != 0 {
		t.Fatalf("down and logout ran a command: %#v %#v", runner.runs, runner.started)
	}
	if len(mesh.edits) != 1 || mesh.edits[0].WantRunning || !mesh.edits[0].WantRunningSet {
		t.Fatalf("down edits %#v", mesh.edits)
	}
	if mesh.logouts != 1 {
		t.Fatalf("logouts %d", mesh.logouts)
	}
}

func testEngine(dir string, runner *fakeRunner, mesh *fakeMesh) *Engine {
	return &Engine{
		Dir:    dir,
		runner: runner,
		probe:  func(context.Context, string) bool { return true },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
		dial:   func(string) meshClient { return mesh },
	}
}

func TestEnsureDoesNotLaunchDaemon(t *testing.T) {
	runner := &fakeRunner{found: map[string]string{"tailscaled": "tailscaled"}}
	e := &Engine{
		Dir:    t.TempDir(),
		runner: runner,
		probe:  func(context.Context, string) bool { return false },
		read:   func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	err := e.Ensure(context.Background())
	if err == nil || !strings.Contains(err.Error(), "not running") {
		t.Fatalf("error %v", err)
	}
	if len(runner.started) != 0 || len(runner.runs) != 0 {
		t.Fatalf("ensure launched a process: %#v %#v", runner.started, runner.runs)
	}
}

func TestEnsureUsesTheInstalledTailscaleDaemon(t *testing.T) {
	runner := &fakeRunner{}
	e := &Engine{
		Dir:    t.TempDir(),
		runner: runner,
		probe: func(_ context.Context, socket string) bool {
			return socket == OfficialSocket()
		},
		read: func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	if err := e.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if e.currentSocket() != OfficialSocket() {
		t.Fatalf("socket %s", e.currentSocket())
	}
	if len(runner.started) != 0 {
		t.Fatal("ensure launched a process")
	}
}

func TestEnsureUsesOtterscaleWhenTailscaleIsAbsent(t *testing.T) {
	e := &Engine{
		Dir:       t.TempDir(),
		runner:    &fakeRunner{},
		installed: func() bool { return false },
		probe: func(_ context.Context, socket string) bool {
			return socket == ServiceSocket()
		},
		read: func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	if err := e.Ensure(context.Background()); err != nil {
		t.Fatal(err)
	}
	if e.currentSocket() != ServiceSocket() {
		t.Fatalf("socket %s", e.currentSocket())
	}
}

func TestEnsureAsksToStartTailscaleWhenItIsInstalled(t *testing.T) {
	e := &Engine{
		Dir:       t.TempDir(),
		runner:    &fakeRunner{},
		installed: func() bool { return true },
		probe:     func(context.Context, string) bool { return false },
		read:      func(context.Context, string) (Status, error) { return Status{}, nil },
	}
	err := e.Ensure(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Start it") {
		t.Fatalf("error %v", err)
	}
}

func TestFromIPNHidesAddressesWhenStopped(t *testing.T) {
	st := fromIPN(&ipnstate.Status{
		BackendState: "Stopped",
		Self: &ipnstate.PeerStatus{
			HostName:     "robosushie",
			TailscaleIPs: []netip.Addr{netip.MustParseAddr("100.64.0.2")},
		},
	})
	if st.Online || len(st.Addresses) != 0 || st.Hostname != "robosushie" {
		t.Fatalf("%#v", st)
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
