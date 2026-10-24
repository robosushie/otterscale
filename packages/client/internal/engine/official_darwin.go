//go:build darwin

package engine

import "os"

// OfficialInstalled reports whether the Tailscale launch daemon is installed.
func OfficialInstalled() bool {
	for _, path := range []string{
		"/Library/LaunchDaemons/com.tailscale.tailscaled.plist",
		"/Library/LaunchDaemons/com.tailscale.ipn.macsys.plist",
	} {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			return true
		}
	}
	return false
}
