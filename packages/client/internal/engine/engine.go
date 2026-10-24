package engine

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"otterscale/client/internal/config"
	"tailscale.com/ipn"
	"tailscale.com/ipn/ipnstate"
)

// meshClient is the local daemon socket. The auth key is passed only to Start.
type meshClient interface {
	Start(ctx context.Context, opts ipn.Options) error
	EditPrefs(ctx context.Context, mp *ipn.MaskedPrefs) (*ipn.Prefs, error)
	Logout(ctx context.Context) error
	StartLoginInteractive(ctx context.Context) error
	StatusWithoutPeers(ctx context.Context) (*ipnstate.Status, error)
}

const privilegeHint = "Creating the tunnel needs an administrator on Windows, or root on Linux and macOS. Quit any other mesh client already running on this machine, then try again."

// Status is the local machine's mesh state.
type Status struct {
	DaemonRunning bool     `json:"daemonRunning"`
	BackendState  string   `json:"backendState"`
	Online        bool     `json:"online"`
	Hostname      string   `json:"hostname"`
	DNSName       string   `json:"dnsName"`
	Addresses     []string `json:"addresses"`
	LoginServer   string   `json:"loginServer"`
	Message       string   `json:"message"`
}

// UpOptions registers or reconnects this machine.
// AuthKey is used once and is not stored.
type UpOptions struct {
	AuthKey     string
	LoginServer string
	Hostname    string
}

// Runner executes the open-source mesh binaries.
type Runner interface {
	Find(names []string) (string, error)
	Run(ctx context.Context, name string, args []string) (stdout, stderr string, err error)
	Start(name string, args []string) error
}

// Engine drives tailscaled for this computer. Join and leave go through its socket.
type Engine struct {
	Dir       string
	runner    Runner
	probe     func(ctx context.Context, socket string) bool
	read      func(ctx context.Context, socket string) (Status, error)
	dial      func(socket string) meshClient
	installed func() bool

	mu       sync.Mutex
	socket   string
	resolved bool
	startErr error
}

// New returns an engine that uses the local OS.
func New() *Engine {
	return &Engine{
		runner: osRunner{},
		probe:  probeSocket,
		read:   readStatus,
		dial:   dialSocket,
	}
}

const serviceDown = "The Otterscale service is not running."

// ServiceSocket is the local API of the Otterscale system service.
func ServiceSocket() string {
	switch runtime.GOOS {
	case "windows":
		return `\\.\pipe\otterscale-daemon`
	case "darwin":
		return "/var/run/otterscale/daemon.sock"
	default:
		return "/run/otterscale/daemon.sock"
	}
}

// DaemonStateDir is where the system service stores its node state.
func DaemonStateDir() string {
	switch runtime.GOOS {
	case "windows":
		return `C:\ProgramData\Otterscale`
	case "darwin":
		return "/Library/Application Support/Otterscale"
	default:
		return "/var/lib/otterscale"
	}
}

// OfficialSocket is the local API of the official Tailscale client.
func OfficialSocket() string {
	if runtime.GOOS == "windows" {
		return `\\.\pipe\ProtectedPrefix\Administrators\Tailscale\tailscaled`
	}
	return "/var/run/tailscale/tailscaled.sock"
}

// Ensure attaches to the Otterscale system service. It does not start one.
func (e *Engine) Ensure(ctx context.Context) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.ensureLocked(ctx)
}

// Status reports daemon state. It does not start the daemon.
func (e *Engine) Status(ctx context.Context) (Status, error) {
	cfg, cfgErr := e.load()
	st := Status{Addresses: []string{}}
	if cfgErr == nil {
		st.LoginServer = cfg.LoginServer
		st.Hostname = cfg.Hostname
	}
	socket, running := e.attachedSocket(ctx)
	if !running {
		st.Message = e.idleMessage()
		return st, nil
	}
	live, err := e.read(ctx, socket)
	if err != nil {
		st.Message = err.Error()
		return st, nil
	}
	live.DaemonRunning = true
	live.LoginServer = st.LoginServer
	if live.Hostname == "" {
		live.Hostname = st.Hostname
	}
	if live.Addresses == nil {
		live.Addresses = []string{}
	}
	return live, nil
}

// Up registers this machine when AuthKey is set, or reconnects when it is empty.
// A new auth key follows the console contract: logout, then up.
func (e *Engine) Up(ctx context.Context, opts UpOptions) error {
	e.mu.Lock()
	e.startErr = nil
	e.resolved = false
	e.mu.Unlock()

	if err := e.Ensure(ctx); err != nil {
		return err
	}
	cfg, err := e.load()
	if err != nil {
		return err
	}
	opts.AuthKey = strings.TrimSpace(opts.AuthKey)
	opts.LoginServer = strings.TrimSpace(opts.LoginServer)
	opts.Hostname = strings.TrimSpace(opts.Hostname)
	login := opts.LoginServer
	if login == "" {
		login = cfg.LoginServer
	}
	if login == "" {
		return errors.New("set a Headscale URL in Settings or pass --login-server")
	}
	if err := (config.File{LoginServer: login}).Validate(); err != nil {
		return err
	}
	host := opts.Hostname
	if host == "" {
		host = cfg.Hostname
	}
	if opts.LoginServer != "" {
		cfg.LoginServer = opts.LoginServer
	}
	if opts.Hostname != "" {
		cfg.Hostname = opts.Hostname
	}
	if opts.LoginServer != "" || opts.Hostname != "" {
		if err := e.save(cfg); err != nil {
			return err
		}
	}

	client := e.client(e.currentSocket())
	if opts.AuthKey != "" {
		// The console contract logs out before registering with a key. A fresh
		// daemon has nothing to log out of, so a logout failure does not stop up.
		_ = client.Logout(ctx)
		if err := client.Start(ctx, ipn.Options{
			AuthKey:     opts.AuthKey,
			UpdatePrefs: joinPrefs(login, host),
		}); err != nil {
			return socketErr(err, opts.AuthKey)
		}
		// The key is already on the daemon. This starts that login and does not open a browser.
		if err := client.StartLoginInteractive(ctx); err != nil {
			return socketErr(err, opts.AuthKey)
		}
		return e.waitRunning(ctx, client, opts.AuthKey)
	}
	prefs := &ipn.MaskedPrefs{WantRunningSet: true, ControlURLSet: true}
	prefs.WantRunning = true
	prefs.ControlURL = login
	if host != "" {
		prefs.HostnameSet = true
		prefs.Hostname = host
	}
	if _, err := client.EditPrefs(ctx, prefs); err != nil {
		return decorate(err.Error())
	}
	return nil
}

// Down stops traffic for this machine without deleting the auth key.
func (e *Engine) Down(ctx context.Context) error {
	client, err := e.open(ctx)
	if err != nil {
		return err
	}
	prefs := &ipn.MaskedPrefs{WantRunningSet: true}
	prefs.WantRunning = false
	if _, err := client.EditPrefs(ctx, prefs); err != nil {
		return decorate(err.Error())
	}
	return nil
}

// Logout signs this machine out of the coordination server.
func (e *Engine) Logout(ctx context.Context) error {
	client, err := e.open(ctx)
	if err != nil {
		return err
	}
	if err := client.Logout(ctx); err != nil {
		return decorate(err.Error())
	}
	return nil
}

func (e *Engine) open(ctx context.Context) (meshClient, error) {
	socket, running := e.attachedSocket(ctx)
	if !running {
		return nil, errors.New(e.idleMessage())
	}
	return e.client(socket), nil
}

func (e *Engine) client(socket string) meshClient {
	if e.dial != nil {
		return e.dial(socket)
	}
	return dialSocket(socket)
}

func joinPrefs(login, host string) *ipn.Prefs {
	prefs := ipn.NewPrefs()
	prefs.ControlURL = login
	prefs.WantRunning = true
	prefs.LoggedOut = false
	if host != "" {
		prefs.Hostname = host
	}
	return prefs
}

func socketErr(err error, secret string) error {
	return decorate(redact(err.Error(), secret))
}

// waitRunning blocks until the daemon is on the network. StartLoginInteractive
// only begins the auth-key login; Headscale has no node until the state is Running.
func (e *Engine) waitRunning(ctx context.Context, client meshClient, secret string) error {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		st, err := client.StatusWithoutPeers(ctx)
		if err == nil && st != nil && st.BackendState == "Running" {
			return nil
		}
		select {
		case <-ctx.Done():
			return socketErr(errors.New("the coordination server did not accept the auth key"), secret)
		case <-ticker.C:
		}
	}
}

func (e *Engine) ensureLocked(ctx context.Context) error {
	if socket, ok := e.findRunning(ctx); ok {
		e.socket = socket
		e.resolved = true
		e.startErr = nil
		return nil
	}
	if e.tailscaleInstalled() {
		e.startErr = errors.New("The Tailscale service is not running. Start it, then try again.")
		return e.startErr
	}
	e.startErr = errors.New(serviceDown)
	return e.startErr
}

func (e *Engine) tailscaleInstalled() bool {
	if e.installed != nil {
		return e.installed()
	}
	return OfficialInstalled()
}

func (e *Engine) findRunning(ctx context.Context) (string, bool) {
	official := OfficialSocket()
	if e.probe(ctx, official) {
		return official, true
	}
	socket := ServiceSocket()
	if e.probe(ctx, socket) {
		return socket, true
	}
	return "", false
}

func (e *Engine) attachedSocket(ctx context.Context) (string, bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.resolved && e.probe(ctx, e.socket) {
		return e.socket, true
	}
	socket, ok := e.findRunning(ctx)
	if ok {
		e.socket = socket
		e.resolved = true
	}
	return socket, ok
}

func (e *Engine) currentSocket() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.socket
}

func (e *Engine) directory() (string, error) {
	if e.Dir != "" {
		return e.Dir, nil
	}
	return config.Dir()
}

func (e *Engine) load() (config.File, error) {
	dir, err := e.directory()
	if err != nil {
		return config.File{}, err
	}
	return config.LoadFrom(dir)
}

func (e *Engine) save(file config.File) error {
	dir, err := e.directory()
	if err != nil {
		return err
	}
	return config.SaveTo(dir, file)
}

func (e *Engine) idleMessage() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.startErr != nil {
		return e.startErr.Error()
	}
	return serviceDown
}

func redact(message, secret string) string {
	if secret == "" {
		return message
	}
	return strings.ReplaceAll(message, secret, "[redacted]")
}

func decorate(message string) error {
	lower := strings.ToLower(message)
	if strings.Contains(lower, "permission") ||
		strings.Contains(lower, "access is denied") ||
		strings.Contains(lower, "operation not permitted") ||
		strings.Contains(lower, "must be run as root") ||
		strings.Contains(lower, "administrator") {
		return fmt.Errorf("%s\n%s", message, privilegeHint)
	}
	return errors.New(message)
}

type osRunner struct{}

func (osRunner) Find(names []string) (string, error) {
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exe)
		for _, name := range names {
			candidate := filepath.Join(dir, name)
			info, statErr := os.Stat(candidate)
			if statErr == nil && !info.IsDir() {
				return candidate, nil
			}
		}
	}
	for _, name := range names {
		if path, lookErr := exec.LookPath(name); lookErr == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("could not find %s next to Otterscale or on PATH", names[0])
}

func (osRunner) Run(ctx context.Context, name string, args []string) (string, string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func (osRunner) Start(name string, args []string) error {
	cmd := exec.Command(name, args...)
	detach(cmd)
	logPath := filepath.Join(filepath.Dir(name), "daemon.log")
	if dir, err := config.Dir(); err == nil {
		_ = os.MkdirAll(dir, 0o700)
		logPath = filepath.Join(dir, "daemon.log")
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err == nil {
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}
	if err := cmd.Start(); err != nil {
		if logFile != nil {
			_ = logFile.Close()
		}
		return err
	}
	if logFile != nil {
		_ = logFile.Close()
	}
	go cmd.Wait()
	return nil
}
