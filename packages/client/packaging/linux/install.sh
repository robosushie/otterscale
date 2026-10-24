#!/bin/sh
# Install Otterscale and its mesh daemon.
# Run: sudo ./install.sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run sudo ./install.sh" >&2
  exit 1
fi

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
CLIENT=$(CDPATH= cd -- "$ROOT/../.." && pwd)
DIST="$ROOT/dist"
mkdir -p "$DIST"

if [ ! -x "$DIST/otterscale" ] || [ ! -x "$DIST/tailscaled" ]; then
  if ! command -v go >/dev/null 2>&1; then
    echo "Put otterscale and tailscaled in $DIST, or install Go and run this script from a checkout." >&2
    exit 1
  fi
  echo "Building Otterscale..."
  (
    cd "$CLIENT"
    GOTOOLCHAIN="${GOTOOLCHAIN:-go1.25.3}"
    export GOTOOLCHAIN
    go build -o "$DIST/tailscaled" tailscale.com/cmd/tailscaled
    go build -tags production -o "$DIST/otterscale" ./cmd/otterscale-desktop
  )
fi

install -d -m 0755 /opt/otterscale
install -m 0755 "$DIST/otterscale" /opt/otterscale/otterscale
install -m 0755 "$DIST/tailscaled" /opt/otterscale/tailscaled
exec /opt/otterscale/otterscale --install-service
