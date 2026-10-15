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
)

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

// Engine drives tailscaled and the tailscale command for this computer.
type Engine struct {
	Dir    string
	runner Runner
	probe  func(ctx context.Context, socket string) bool
	read   func(ctx context.Context, socket string) (Status, error)

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
	}
}

// Ensure starts the mesh daemon when one is not already running.
// A failed start is remembered until Up is called again.
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

	socket := e.currentSocket()
	bin, err := e.runner.Find(cliNames())
	if err != nil {
		return err
	}
	if opts.AuthKey != "" {
		// The console contract logs out before registering with a key. A fresh
		// daemon has nothing to log out of, so a logout failure does not stop up.
		_, _, _ = e.runner.Run(ctx, bin, socketArgs(socket, "logout"))
	}
	args := socketArgs(socket, "up", "--login-server="+login)
	if opts.AuthKey != "" {
		args = append(args, "--auth-key="+opts.AuthKey)
	}
	if host != "" {
		args = append(args, "--hostname="+host)
	}
	_, stderr, err := e.runner.Run(ctx, bin, args)
	if err != nil {
		return decorate(redact(firstText(stderr, err.Error()), opts.AuthKey))
	}
	return nil
}

// Down stops traffic for this machine without deleting the auth key.
func (e *Engine) Down(ctx context.Context) error {
	return e.simple(ctx, "down")
}

// Logout signs this machine out of the coordination server.
func (e *Engine) Logout(ctx context.Context) error {
	return e.simple(ctx, "logout")
}

func (e *Engine) simple(ctx context.Context, sub string) error {
	socket, running := e.attachedSocket(ctx)
	if !running {
		return errors.New(e.idleMessage())
	}
	bin, err := e.runner.Find(cliNames())
	if err != nil {
		return err
	}
	_, stderr, err := e.runner.Run(ctx, bin, socketArgs(socket, sub))
	if err != nil {
		return decorate(firstText(stderr, err.Error()))
	}
	return nil
}

func (e *Engine) ensureLocked(ctx context.Context) error {
	if socket, ok := e.findRunning(ctx); ok {
		e.socket = socket
		e.resolved = true
		e.startErr = nil
		return nil
	}
	if e.startErr != nil {
		return e.startErr
	}
	dir, err := e.directory()
	if err != nil {
		e.startErr = err
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		e.startErr = err
		return err
	}
	bin, err := e.runner.Find(daemonNames())
	if err != nil {
		e.startErr = err
		return err
	}
	own := ownSocket(dir)
	args := []string{"--state=" + filepath.Join(dir, "daemon.state"), "--socket=" + own}
	if err := e.runner.Start(bin, args); err != nil {
		e.startErr = decorate(err.Error())
		return e.startErr
	}
	deadline := time.Now().Add(8 * time.Second)
	for {
		if e.probe(ctx, own) {
			e.socket = own
			e.resolved = true
			e.startErr = nil
			return nil
		}
		if time.Now().After(deadline) {
			break
		}
		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			e.startErr = ctx.Err()
			return e.startErr
		case <-timer.C:
		}
	}
	e.startErr = decorate(daemonFailure(dir))
	return e.startErr
}

func daemonFailure(dir string) string {
	msg := "the mesh daemon did not become ready"
	raw, err := os.ReadFile(filepath.Join(dir, "daemon.log"))
	if err != nil {
		return msg
	}
	text := strings.TrimSpace(string(raw))
	if text == "" {
		return msg
	}
	if len(text) > 800 {
		text = text[len(text)-800:]
	}
	return msg + "\n" + text
}

func (e *Engine) findRunning(ctx context.Context) (string, bool) {
	if e.probe(ctx, "") {
		return "", true
	}
	dir, err := e.directory()
	if err != nil {
		return "", false
	}
	own := ownSocket(dir)
	if e.probe(ctx, own) {
		return own, true
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
	return "Mesh daemon is not running."
}

func socketArgs(socket, sub string, extra ...string) []string {
	args := make([]string, 0, 4+len(extra))
	if socket != "" {
		args = append(args, "--socket="+socket)
	}
	args = append(args, sub)
	args = append(args, extra...)
	return args
}

func cliNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"tailscale.exe", "tailscale"}
	}
	return []string{"tailscale"}
}

func daemonNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"tailscaled.exe", "tailscaled"}
	}
	return []string{"tailscaled"}
}

func ownSocket(dir string) string {
	if runtime.GOOS == "windows" {
		return `\\.\pipe\otterscale-daemon`
	}
	return filepath.Join(dir, "daemon.sock")
}

func firstText(stderr, fallback string) string {
	stderr = strings.TrimSpace(stderr)
	if stderr != "" {
		return stderr
	}
	return strings.TrimSpace(fallback)
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
