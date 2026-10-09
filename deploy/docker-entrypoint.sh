#!/bin/sh
set -e

SECRETS="${OTTERSCALE_SECRETS_DIR:-/otterscale-secrets}"

load_secret() {
  name=$1
  eval "current=\${$name:-}"
  if [ -n "$current" ]; then
    return
  fi
  if [ -s "${SECRETS}/${name}" ]; then
    value=$(cat "${SECRETS}/${name}")
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
  load_secret AUTH_SECRET
  load_secret APPS_EDGE_AUTHKEY
fi

if [ -n "${DATABASE_URL:-}" ]; then
  mkdir -p /data
  echo "Applying database migrations (prisma migrate deploy)..."
  prisma migrate deploy
fi

exec node server.js
