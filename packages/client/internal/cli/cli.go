// Package cli is the headless Otterscale client.
package cli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"strings"
	"time"

	"otterscale/client/internal/config"
	"otterscale/client/internal/engine"
)

// Service is the local machine control used by the CLI.
type Service interface {
	Show() (config.File, error)
	Set(key, value string) error
	Up(ctx context.Context, authKey, loginServer, hostname string) error
	Status(ctx context.Context) (engine.Status, error)
	Down(ctx context.Context) error
	Logout(ctx context.Context) error
}

// Live is the CLI backed by the local engine.
type Live struct {
	Engine *engine.Engine
}

func (s Live) Show() (config.File, error) {
	if s.Engine != nil && s.Engine.Dir != "" {
		return config.LoadFrom(s.Engine.Dir)
	}
	return config.Load()
}

func (s Live) Set(key, value string) error {
	file, err := s.Show()
	if err != nil {
		return err
	}
	if err := config.Apply(&file, key, value); err != nil {
		return err
	}
	if s.Engine != nil && s.Engine.Dir != "" {
		return config.SaveTo(s.Engine.Dir, file)
	}
	return config.Save(file)
}

func (s Live) Up(ctx context.Context, authKey, loginServer, hostname string) error {
	return s.engine().Up(ctx, engine.UpOptions{
		AuthKey:     authKey,
		LoginServer: loginServer,
		Hostname:    hostname,
	})
}

func (s Live) Status(ctx context.Context) (engine.Status, error) {
	return s.engine().Status(ctx)
}

func (s Live) Down(ctx context.Context) error {
	return s.engine().Down(ctx)
}

func (s Live) Logout(ctx context.Context) error {
	return s.engine().Logout(ctx)
}

func (s Live) engine() *engine.Engine {
	if s.Engine != nil {
		return s.Engine
	}
	return engine.New()
}

// Run executes one invocation. args does not include the program name.
func Run(args []string, stdout, stderr io.Writer, svc Service) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, usage)
		return 2
	}
	switch args[0] {
	case "config":
		return runConfig(args[1:], stdout, stderr, svc)
	case "up":
		return runUp(args[1:], stdout, stderr, svc)
	case "status":
		return runStatus(stdout, stderr, svc)
	case "down":
		return runAction(stderr, svc.Down)
	case "logout":
		return runAction(stderr, svc.Logout)
	case "-h", "--help", "help":
		fmt.Fprintln(stdout, usage)
		return 0
	default:
		fmt.Fprintf(stderr, "unknown command %q\n%s\n", args[0], usage)
		return 2
	}
}

const usage = `Otterscale client

  otterscale config show
  otterscale config set console-url <url>
  otterscale config set login-server <url>
  otterscale config set hostname <name>
  otterscale up --auth-key <key> [--login-server <url>] [--hostname <name>]
  otterscale status
  otterscale down
  otterscale logout`

func runConfig(args []string, stdout, stderr io.Writer, svc Service) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, usage)
		return 2
	}
	switch args[0] {
	case "show":
		file, err := svc.Show()
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		fmt.Fprintf(stdout, "console-url: %s\nlogin-server: %s\nhostname: %s\n", file.ConsoleURL, file.LoginServer, file.Hostname)
		return 0
	case "set":
		if len(args) != 3 {
			fmt.Fprintln(stderr, "usage: otterscale config set <console-url|login-server|hostname> <value>")
			return 2
		}
		if err := svc.Set(args[1], args[2]); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return 0
	default:
		fmt.Fprintf(stderr, "unknown config command %q\n", args[0])
		return 2
	}
}

func runUp(args []string, stdout, stderr io.Writer, svc Service) int {
	fs := flag.NewFlagSet("up", flag.ContinueOnError)
	fs.SetOutput(stderr)
	authKey := fs.String("auth-key", "", "auth key from the console")
	login := fs.String("login-server", "", "Headscale URL")
	host := fs.String("hostname", "", "name for this machine")
	fs.Usage = func() { fmt.Fprintln(stderr, usage) }
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if strings.TrimSpace(*authKey) == "" {
		fmt.Fprintln(stderr, "up requires --auth-key")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := svc.Up(ctx, *authKey, *login, *host); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprintln(stdout, "Machine registered.")
	return 0
}

func runStatus(stdout, stderr io.Writer, svc Service) int {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := svc.Status(ctx)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprint(stdout, FormatStatus(st))
	return 0
}

func runAction(stderr io.Writer, fn func(context.Context) error) int {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := fn(ctx); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}

// FormatStatus is the text form of a local status.
func FormatStatus(st engine.Status) string {
	var b strings.Builder
	if st.DaemonRunning {
		fmt.Fprintf(&b, "Daemon: running\nState: %s\n", st.BackendState)
	} else {
		b.WriteString("Daemon: not running\n")
	}
	fmt.Fprintf(&b, "Hostname: %s\nAddresses: %s\nHeadscale URL: %s\n", st.Hostname, strings.Join(st.Addresses, " "), st.LoginServer)
	if st.Message != "" {
		fmt.Fprintf(&b, "%s\n", st.Message)
	}
	return b.String()
}
