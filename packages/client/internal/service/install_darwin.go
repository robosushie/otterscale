//go:build darwin

package service

import (
	"errors"
	"os"
)

func requirePrivileged() error {
	if os.Geteuid() != 0 {
		return errors.New("the Otterscale installer must run as root")
	}
	return nil
}

func register(binary string, start bool) error {
	if err := os.MkdirAll("/var/run/otterscale", 0o755); err != nil {
		return err
	}
	const path = "/Library/LaunchDaemons/com.otterscale.daemon.plist"
	if err := os.WriteFile(path, []byte(launchdPlist(binary, start)), 0o644); err != nil {
		return err
	}
	_ = runCmd("launchctl", "bootout", "system/com.otterscale.daemon")
	if !start {
		return nil
	}
	_ = runCmd("launchctl", "enable", "system/com.otterscale.daemon")
	return runCmd("launchctl", "bootstrap", "system", path)
}

func startOfficial() error {
	if err := runCmd("launchctl", "kickstart", "-k", "system/com.tailscale.tailscaled"); err != nil {
		if err := runCmd("launchctl", "bootstrap", "system", "/Library/LaunchDaemons/com.tailscale.tailscaled.plist"); err != nil {
			return err
		}
	}
	return waitOfficial()
}

func unregister() error {
	_ = runCmd("launchctl", "bootout", "system/com.otterscale.daemon")
	err := os.Remove("/Library/LaunchDaemons/com.otterscale.daemon.plist")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
