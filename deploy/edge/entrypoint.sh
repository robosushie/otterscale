#!/bin/sh
set -eu

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
