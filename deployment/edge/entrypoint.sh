#!/bin/sh
set -eu

SECRETS="${OTTERSCALE_SECRETS_DIR:-/otterscale-secrets}"

load_secret() {
  name=$1
  if [ -s "${SECRETS}/${name}" ]; then
    value=$(tr -d '\r\n' < "${SECRETS}/${name}")
    export "$name=$value"
  fi
}

reset_edge_state_if_needed() {
  flag="${SECRETS}/EDGE_STATE_RESET"
  [ -f "$flag" ] || return 0
  dir="${TS_STATE_DIR:-/var/lib/tailscale}"
  echo "Resetting tsnet state at ${dir}"
  if [ -d "$dir" ]; then
    find "$dir" -mindepth 1 -depth -delete
  fi
  rm -f "$flag"
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
  reset_edge_state_if_needed
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
