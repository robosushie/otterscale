#!/bin/sh
set -eu

SECRETS="${OTTERSCALE_SECRETS_DIR:-/otterscale-secrets}"
USER_NAME="${HEADSCALE_USER:-tagged-devices}"
CONFIG="${HEADSCALE_CONFIG:-/etc/headscale/config.yaml}"
HS="/ko-app/headscale --config ${CONFIG}"
mkdir -p "$SECRETS"

hs() {
  # shellcheck disable=SC2086
  $HS "$@"
}

wait_ready() {
  i=0
  while [ "$i" -lt 60 ]; do
    if hs users list --output json >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "Headscale did not become ready for bootstrap"
  exit 1
}

extract_key() {
  raw=$1
  key=$raw
  parsed=$(printf '%s' "$raw" | jq -r '.apiKey // .key // .preAuthKey.key // .preauthkey.key // empty' 2>/dev/null || true)
  if [ -n "$parsed" ] && [ "$parsed" != "null" ]; then
    key=$parsed
  else
    key=$(printf '%s' "$raw" | tr -d '\r' | grep -Eo '[A-Za-z0-9_-]{16,}' | tail -n 1 || true)
  fi
  printf '%s' "$key" | tr -d '\n' | tr -d '"'
}

write_secret() {
  name=$1
  value=$2
  printf '%s' "$value" > "${SECRETS}/${name}"
  chmod 600 "${SECRETS}/${name}"
}

wait_ready

users=$(hs users list --output json 2>/dev/null || printf '%s' '[]')
if ! printf '%s' "$users" | grep -q "$USER_NAME"; then
  echo "Creating Headscale user ${USER_NAME}"
  hs users create "$USER_NAME" >/dev/null
fi

if [ ! -s "${SECRETS}/HEADSCALE_API_KEY" ]; then
  echo "Creating Headscale API key"
  raw=$(hs apikeys create --expiration 8760h --output json)
  key=$(extract_key "$raw")
  if [ "${#key}" -lt 16 ]; then
    echo "Headscale did not return an API key"
    exit 1
  fi
  write_secret HEADSCALE_API_KEY "$key"
else
  echo "Reusing HEADSCALE_API_KEY from secrets volume"
fi

if [ ! -s "${SECRETS}/APPS_EDGE_AUTHKEY" ]; then
  echo "Creating reusable tag:edge pre-auth key"
  raw=$(hs preauthkeys create --user "$USER_NAME" --reusable --expiration 8760h --tags tag:edge --output json)
  key=$(extract_key "$raw")
  if [ "${#key}" -lt 16 ]; then
    echo "Headscale did not return an edge pre-auth key"
    exit 1
  fi
  write_secret APPS_EDGE_AUTHKEY "$key"
else
  echo "Reusing APPS_EDGE_AUTHKEY from secrets volume"
fi

if [ ! -s "${SECRETS}/AUTH_SECRET" ]; then
  if [ -n "${AUTH_SECRET:-}" ]; then
    write_secret AUTH_SECRET "$AUTH_SECRET"
  else
    echo "Generating AUTH_SECRET"
    secret=$(openssl rand -base64 32 | tr -d '\n')
    write_secret AUTH_SECRET "$secret"
  fi
elif [ -n "${AUTH_SECRET:-}" ]; then
  write_secret AUTH_SECRET "$AUTH_SECRET"
fi

printf 'ok\n' > "${SECRETS}/READY"
chmod 644 "${SECRETS}/READY"
echo "Otterscale bootstrap complete"
