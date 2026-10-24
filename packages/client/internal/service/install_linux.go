//go:build linux

package service

import (
	"errors"
	"os"
)

func requirePrivileged() error {
	if os.Geteuid() != 0 {
		return errors.New("run sudo ./install.sh")
	}
	return nil
}

func register(binary string, start bool) error {
	const unit = "/etc/systemd/system/otterscale.service"
	if err := os.WriteFile(unit, []byte(systemdUnit(binary)), 0o644); err != nil {
		return err
	}
	if err := runCmd("systemctl", "daemon-reload"); err != nil {
		return err
	}
	if !start {
		_ = runCmd("systemctl", "disable", "--now", "otterscale.service")
		return nil
	}
	return runCmd("systemctl", "enable", "--now", "otterscale.service")
}

func startOfficial() error {
	if err := runCmd("systemctl", "enable", "--now", "tailscaled"); err != nil {
		return err
	}
	return waitOfficial()
}

func unregister() error {
	_ = runCmd("systemctl", "disable", "--now", "otterscale.service")
	_ = os.Remove("/etc/systemd/system/otterscale.service")
	return runCmd("systemctl", "daemon-reload")
}
