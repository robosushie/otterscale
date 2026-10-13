#!/bin/sh
set -eu

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

mkdir -p /var/lib/headscale /var/run/headscale
config=/tmp/headscale.yaml
cp /etc/headscale/config.yaml "$config"
url=$(login_server_url)
escaped=$(printf '%s' "$url" | sed 's/&/\\&/g')
sed -i "s|^server_url:.*|server_url: ${escaped}|" "$config"
echo "Headscale server_url=${url}"

if [ "${1:-serve}" = "serve" ]; then
  exec /ko-app/headscale serve --config "$config"
fi

exec /ko-app/headscale --config "$config" "$@"
