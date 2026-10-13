#!/bin/sh
set -eu

# Railway/Render set PORT for the public listener. Next.js always binds 3000.
if [ -n "${PORT:-}" ] && [ "$PORT" != "3000" ]; then
  CADDY_PORT="$PORT"
  export CADDY_PORT
fi
export PORT=3000
export HOSTNAME="${HOSTNAME:-127.0.0.1}"

SECRETS="${OTTERSCALE_SECRETS_DIR:-/data/secrets}"
export OTTERSCALE_SECRETS_DIR="$SECRETS"
export HEADSCALE_CONFIG="${HEADSCALE_CONFIG:-/tmp/headscale.yaml}"
export DATABASE_URL="${DATABASE_URL:-file:/data/otterscale.db}"
export HEADSCALE_INTERNAL_URL="${HEADSCALE_INTERNAL_URL:-http://127.0.0.1:18080}"
export APPS_ROUTES_PATH="${APPS_ROUTES_PATH:-/data/apps-caddy/routes.json}"
export APPS_PROBE_URL="${APPS_PROBE_URL:-http://127.0.0.1:4180}"
export TS_STATE_DIR="${TS_STATE_DIR:-/data/tailscale}"
export TS_HOSTNAME="${TS_HOSTNAME:-edge}"
export LISTEN_ADDR="${LISTEN_ADDR:-127.0.0.1:8081}"
export PROBE_ADDR="${PROBE_ADDR:-:4180}"
export XDG_DATA_HOME="${XDG_DATA_HOME:-/data/caddy}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/data/caddy-config}"

mkdir -p /data/headscale /data/tailscale /data/apps-caddy "$SECRETS" \
  "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" /var/run/headscale /data
if [ -d /var/lib/headscale ] && [ ! -L /var/lib/headscale ]; then
  rm -rf /var/lib/headscale
fi
ln -sfn /data/headscale /var/lib/headscale

login_server_url() {
  raw=$(printf '%s' "${OTTERSCALE_DOMAIN:-}" | tr -d '[:space:]')
  if [ -z "$raw" ]; then
    printf '%s\n' "http://127.0.0.1:8080"
    return
  fi
  case "$raw" in
    http://*|https://*)
      printf '%s\n' "$raw" | sed -E 's|(https?://[^/]+).*|\1|'
      ;;
    *)
      printf '%s\n' "https://${raw%/}"
      ;;
  esac
}

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
  dir="${TS_STATE_DIR:-/data/tailscale}"
  echo "Resetting tsnet state at ${dir}"
  if [ -d "$dir" ]; then
    find "$dir" -mindepth 1 -depth -delete
  fi
  rm -f "$flag"
}

cp /etc/headscale/config.yaml "$HEADSCALE_CONFIG"
url=$(login_server_url)
escaped=$(printf '%s' "$url" | sed 's/&/\\&/g')
sed -i "s|^server_url:.*|server_url: ${escaped}|" "$HEADSCALE_CONFIG"
# 0.0.0.0 so a published host port can reach Headscale. 18080 avoids PORT.
# In-container clients still use 127.0.0.1:18080.
sed -i "s|^listen_addr:.*|listen_addr: 0.0.0.0:18080|" "$HEADSCALE_CONFIG"
echo "Headscale server_url=${url} listen_addr=0.0.0.0:18080"

/ko-app/headscale serve --config "$HEADSCALE_CONFIG" &
headscale_pid=$!

i=0
while [ "$i" -lt 60 ]; do
  if ! kill -0 "$headscale_pid" 2>/dev/null; then
    echo "Headscale exited before becoming ready"
    exit 1
  fi
  if /ko-app/headscale --config "$HEADSCALE_CONFIG" users list --output json >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ "$i" -ge 60 ]; then
  echo "Headscale did not become ready"
  exit 1
fi

/bootstrap.sh

load_secret HEADSCALE_API_KEY
load_secret AUTH_SECRET
load_secret APPS_EDGE_AUTHKEY
reset_edge_state_if_needed

echo "Applying database migrations (prisma migrate deploy)..."
prisma migrate deploy

node server.js &
app_pid=$!

/usr/local/bin/proxy &
proxy_pid=$!

if [ -n "${CADDY_PORT:-}" ]; then
  echo "Caddy public HTTP on :${CADDY_PORT}"
  caddy run --config /etc/caddy/Caddyfile.paas --adapter caddyfile &
else
  echo "Caddy local TLS on :80/:443"
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
fi
caddy_pid=$!

term() {
  kill -TERM "$headscale_pid" "$app_pid" "$proxy_pid" "$caddy_pid" 2>/dev/null || true
  wait "$headscale_pid" "$app_pid" "$proxy_pid" "$caddy_pid" 2>/dev/null || true
  exit 143
}
trap term TERM INT

while true; do
  for pid in "$headscale_pid" "$app_pid" "$proxy_pid" "$caddy_pid"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "process ${pid} exited"
      kill -TERM "$headscale_pid" "$app_pid" "$proxy_pid" "$caddy_pid" 2>/dev/null || true
      wait "$headscale_pid" "$app_pid" "$proxy_pid" "$caddy_pid" 2>/dev/null || true
      exit 1
    fi
  done
  sleep 2
done
