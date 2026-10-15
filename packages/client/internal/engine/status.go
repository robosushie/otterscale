package engine

import (
	"context"
	"net/netip"
	"time"

	"tailscale.com/client/local"
	"tailscale.com/ipn/ipnstate"
)

func probeSocket(ctx context.Context, socket string) bool {
	ctx, cancel := context.WithTimeout(ctx, 700*time.Millisecond)
	defer cancel()
	_, err := (&local.Client{Socket: socket}).StatusWithoutPeers(ctx)
	return err == nil
}

func readStatus(ctx context.Context, socket string) (Status, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	raw, err := (&local.Client{Socket: socket}).StatusWithoutPeers(ctx)
	if err != nil {
		return Status{}, err
	}
	return fromIPN(raw), nil
}

func fromIPN(raw *ipnstate.Status) Status {
	st := Status{Addresses: []string{}, BackendState: raw.BackendState}
	st.Online = raw.BackendState == "Running"
	if raw.Self == nil {
		return st
	}
	st.Hostname = raw.Self.HostName
	st.DNSName = raw.Self.DNSName
	st.Addresses = addrs(raw.Self.TailscaleIPs)
	return st
}

func addrs(ips []netip.Addr) []string {
	out := make([]string, 0, len(ips))
	for _, ip := range ips {
		if ip.IsValid() {
			out = append(out, ip.String())
		}
	}
	return out
}
