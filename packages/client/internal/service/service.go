package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"otterscale/client/internal/engine"
	"tailscale.com/client/local"
)

const usingTailscaleMessage = "Otterscale will use the installed Tailscale daemon."

// Install uses the Tailscale daemon when it is already installed.
// Otterscale's own daemon is registered only when Tailscale is absent.
func Install() error {
	if err := requirePrivileged(); err != nil {
		return err
	}
	if useOfficial(engine.OfficialInstalled(), officialRunning()) {
		if err := unregister(); err != nil {
			return err
		}
		if err := startOfficial(); err != nil {
			return err
		}
		fmt.Println(usingTailscaleMessage)
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	binary, err := ensureDaemon(filepath.Dir(exe))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(engine.DaemonStateDir(), 0o700); err != nil {
		return err
	}
	if err := register(binary, true); err != nil {
		return err
	}
	fmt.Println("Otterscale service is running.")
	return nil
}

// Uninstall stops and removes the Otterscale daemon.
func Uninstall() error {
	if err := requirePrivileged(); err != nil {
		return err
	}
	if err := unregister(); err != nil {
		return err
	}
	fmt.Println("Otterscale service removed.")
	return nil
}

func useOfficial(installed, running bool) bool {
	return installed || running
}

func waitOfficial() error {
	deadline := time.Now().Add(15 * time.Second)
	for {
		if officialRunning() {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("the Tailscale service did not become ready")
		}
		time.Sleep(200 * time.Millisecond)
	}
}

func daemonName() string {
	if runtime.GOOS == "windows" {
		return "tailscaled.exe"
	}
	return "tailscaled"
}

func daemonArgs(stateDir, socket string) []string {
	return []string{
		"--state=" + filepath.Join(stateDir, "daemon.state"),
		"--socket=" + socket,
	}
}

func ensureDaemon(dir string) (string, error) {
	dest := filepath.Join(dir, daemonName())
	info, err := os.Stat(dest)
	if err == nil && !info.IsDir() {
		return dest, nil
	}
	src, lookErr := exec.LookPath(daemonName())
	if lookErr != nil {
		return "", errors.New("tailscaled was not found next to Otterscale")
	}
	if err := copyFile(src, dest); err != nil {
		return "", fmt.Errorf("could not copy tailscaled next to Otterscale: %w", err)
	}
	return dest, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func officialRunning() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 700*time.Millisecond)
	defer cancel()
	_, err := (&local.Client{Socket: engine.OfficialSocket()}).StatusWithoutPeers(ctx)
	return err == nil
}

func runCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(out))
		if text == "" {
			return fmt.Errorf("%s: %w", name, err)
		}
		return fmt.Errorf("%s: %s", name, text)
	}
	return nil
}

func systemdUnit(binary string) string {
	return fmt.Sprintf(`[Unit]
Description=Otterscale
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=%s --state=/var/lib/otterscale/daemon.state --socket=/run/otterscale/daemon.sock
Restart=on-failure
RuntimeDirectory=otterscale
RuntimeDirectoryMode=0755

[Install]
WantedBy=multi-user.target
`, systemdExec(binary))
}

func systemdExec(path string) string {
	if strings.ContainsAny(path, " \t\"") {
		return `"` + strings.ReplaceAll(path, `"`, `\"`) + `"`
	}
	return path
}

func launchdPlist(binary string, start bool) string {
	flag := "<false/>"
	if start {
		flag = "<true/>"
	}
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.otterscale.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
    <string>--state=/Library/Application Support/Otterscale/daemon.state</string>
    <string>--socket=/var/run/otterscale/daemon.sock</string>
  </array>
  <key>RunAtLoad</key>
  %s
  <key>KeepAlive</key>
  %s
</dict>
</plist>
`, xmlEscape(binary), flag, flag)
}

func xmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;")
	return replacer.Replace(value)
}
