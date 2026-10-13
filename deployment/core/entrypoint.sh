#!/bin/sh
set -eu

# Compose blanks HEADSCALE_API_KEY so a stale value in .env cannot win.
# Init writes the key that this Headscale accepts onto the secrets volume.
SECRETS="${OTTERSCALE_SECRETS_DIR:-/otterscale-secrets}"

load_secret() {
  name=$1
  if [ -s "${SECRETS}/${name}" ]; then
    value=$(tr -d '\r\n' < "${SECRETS}/${name}")
    export "$name=$value"
  fi
}

if [ -d "$SECRETS" ]; then
  i=0
  while [ ! -s "${SECRETS}/READY" ]; do
    i=$((i + 1))
    if [ "$i" -gt 60 ]; then
      echo "Timed out waiting for Otterscale bootstrap secrets"
      exit 1
    fi
    sleep 2
  done
  load_secret HEADSCALE_API_KEY
  if [ -z "${HEADSCALE_API_KEY:-}" ]; then
    echo "HEADSCALE_API_KEY is missing from ${SECRETS}" >&2
    exit 1
  fi
fi

exec /usr/local/bin/core
