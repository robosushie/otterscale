#!/bin/sh
set -eu

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
  load_secret APPS_EDGE_AUTHKEY
fi

/usr/local/bin/proxy &
proxy_pid=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

term() {
  kill -TERM "$proxy_pid" "$caddy_pid" 2>/dev/null || true
  wait "$proxy_pid" "$caddy_pid" 2>/dev/null || true
  exit 143
}

trap term TERM INT

wait "$caddy_pid"
status=$?
kill -TERM "$proxy_pid" 2>/dev/null || true
wait "$proxy_pid" 2>/dev/null || true
exit "$status"
