//go:build windows

package engine

import "golang.org/x/sys/windows/registry"

// OfficialInstalled reports whether the Tailscale service is registered.
func OfficialInstalled() bool {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, `SYSTEM\CurrentControlSet\Services\Tailscale`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	key.Close()
	return true
}
