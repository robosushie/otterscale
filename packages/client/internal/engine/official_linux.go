//go:build linux

package engine

import "os"

// OfficialInstalled reports whether the Tailscale daemon unit is installed.
func OfficialInstalled() bool {
	for _, path := range []string{
		"/lib/systemd/system/tailscaled.service",
		"/usr/lib/systemd/system/tailscaled.service",
		"/etc/systemd/system/tailscaled.service",
	} {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}
