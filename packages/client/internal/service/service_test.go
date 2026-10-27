package service

import (
	"strings"
	"testing"

	"otterscale/client/internal/engine"
)

func TestDaemonArgsUseTheServiceSocket(t *testing.T) {
	args := daemonArgs(engine.DaemonStateDir(), engine.ServiceSocket())
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "--state=") || !strings.Contains(joined, "daemon.state") {
		t.Fatalf("args %s", joined)
	}
	if !strings.Contains(joined, "--socket="+engine.ServiceSocket()) {
		t.Fatalf("args %s", joined)
	}
}

func TestInstallUsesTailscaleWhenItIsPresent(t *testing.T) {
	if !useOfficial(true, false) || !useOfficial(false, true) {
		t.Fatal("Tailscale should be used when it is installed or running")
	}
	if useOfficial(false, false) {
		t.Fatal("Otterscale's daemon should be installed when Tailscale is absent")
	}
	if !strings.Contains(usingTailscaleMessage, "installed Tailscale daemon") {
		t.Fatal(usingTailscaleMessage)
	}
}

func TestSystemdUnitListensOnTheOtterscaleSocket(t *testing.T) {
	text := systemdUnit("/opt/otterscale/tailscaled")
	if !strings.Contains(text, "ExecStart=/opt/otterscale/tailscaled --state=/var/lib/otterscale/daemon.state --socket=/run/otterscale/daemon.sock") {
		t.Fatal(text)
	}
	if !strings.Contains(text, "RuntimeDirectory=otterscale") {
		t.Fatal(text)
	}
}

func TestLaunchdStaysInstalledWithoutStarting(t *testing.T) {
	stopped := launchdPlist("/Applications/Otterscale.app/Contents/MacOS/tailscaled", false)
	if strings.Contains(stopped, "<true/>") || !strings.Contains(stopped, "<false/>") {
		t.Fatal(stopped)
	}
	if !strings.Contains(stopped, "--socket=/var/run/otterscale/daemon.sock") {
		t.Fatal(stopped)
	}
	if !strings.Contains(stopped, "--state=/Library/Application Support/Otterscale/daemon.state") {
		t.Fatal(stopped)
	}
	started := launchdPlist("/Applications/Otterscale.app/Contents/MacOS/tailscaled", true)
	if strings.Contains(started, "<false/>") {
		t.Fatal(started)
	}
}
