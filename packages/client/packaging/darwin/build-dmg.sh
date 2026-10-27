#!/bin/bash
# Build the Otterscale installer. The installed app is Otterscale.app.
# Run this on a Mac. It produces otterscale-installer.dmg.
# Signing and notarization stay with your Developer ID.
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Run this script on macOS. It produces otterscale-installer.dmg." >&2
  exit 1
fi

ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
CLIENT=$(CDPATH= cd -- "$ROOT/../.." && pwd)
DIST="$ROOT/dist"
PAYLOAD="$DIST/payload/Applications"
APP="$PAYLOAD/Otterscale.app"
MACOS="$APP/Contents/MacOS"
SCRIPTS="$DIST/scripts"

rm -rf "$DIST/payload" "$SCRIPTS"
mkdir -p "$MACOS" "$SCRIPTS" "$DIST/payload/usr/local/bin"

export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.25.3}"
(
  cd "$CLIENT"
  go build -o "$MACOS/tailscaled" tailscale.com/cmd/tailscaled
  go build -tags production -o "$MACOS/otterscale" ./cmd/desktop
  go build -o "$DIST/payload/usr/local/bin/otterscale" ./cmd/otterscale
)

cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/scripts/postinstall" "$SCRIPTS/postinstall"
chmod 755 "$SCRIPTS/postinstall" "$MACOS/otterscale" "$MACOS/tailscaled" "$DIST/payload/usr/local/bin/otterscale"

pkgbuild \
  --root "$DIST/payload" \
  --scripts "$SCRIPTS" \
  --identifier com.otterscale.client \
  --version 0.1.0 \
  --install-location / \
  "$DIST/otterscale-installer.pkg"

DMG="$DIST/dmg"
rm -rf "$DMG"
mkdir -p "$DMG"
cp "$DIST/otterscale-installer.pkg" "$DMG/otterscale-installer.pkg"
hdiutil create -volname Otterscale -srcfolder "$DMG" -ov -format UDZO "$DIST/otterscale-installer.dmg"
echo "Built $DIST/otterscale-installer.dmg"
echo "Sign and notarize it with your Developer ID before you ship it."
