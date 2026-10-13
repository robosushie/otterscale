#!/bin/sh
# Mint Headscale credentials into the secrets directory for THIS database.
# HEADSCALE_API_KEY and APPS_EDGE_AUTHKEY are created by Headscale (hashed in
# SQLite). Plaintext cannot be read back from the DB — it lives only in this
# directory. A host env value is used only when Headscale accepts it.
# AUTH_SECRET is an app secret: the environment wins when it is set.
set -eu

SECRETS="${OTTERSCALE_SECRETS_DIR:-/otterscale-secrets}"
USER_NAME="${HEADSCALE_USER:-tagged-devices}"
CONFIG="${HEADSCALE_CONFIG:-/etc/headscale/config.yaml}"
PROBE_URL="${HEADSCALE_INTERNAL_URL:-http://headscale:8080}"
PROBE_URL="${PROBE_URL%/}"
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

# Headscale 0.23 prints a new API key as a JSON string, "prefix.secret".
# The dot is part of the key. A token regex that stops at "." keeps only the
# secret, and Headscale rejects that.
extract_key() {
  raw=$1
  parsed=$(printf '%s' "$raw" | jq -r '
    if type == "string" then .
    elif type == "object" then
      (.apiKey // .key // .preAuthKey.key // .preauthkey.key // empty)
    else empty end
  ' 2>/dev/null || true)
  if [ -n "$parsed" ] && [ "$parsed" != "null" ]; then
    printf '%s' "$parsed" | tr -d '\r\n'
    return 0
  fi
  printf '%s' "$raw" | tr -d '\r\n"[:space:]'
}

read_secret() {
  name=$1
  if [ ! -s "${SECRETS}/${name}" ]; then
    return 0
  fi
  tr -d '\r\n' < "${SECRETS}/${name}"
}

write_secret() {
  name=$1
  value=$2
  printf '%s' "$value" > "${SECRETS}/${name}"
  chmod 600 "${SECRETS}/${name}"
}

api_key_valid() {
  key=$1
  [ "${#key}" -ge 16 ] || return 1
  headers=$(wget -S -O /dev/null --timeout=8 \
    --header="Authorization: Bearer ${key}" \
    "${PROBE_URL}/api/v1/node" 2>&1 || true)
  printf '%s\n' "$headers" | grep -Eq 'HTTP/[0-9.]+ 200([^0-9]|$)'
}

edge_key_valid() {
  key=$1
  [ "${#key}" -ge 16 ] || return 1
  raw=$(hs preauthkeys list --user "$USER_NAME" --output json 2>/dev/null || true)
  [ -n "$raw" ] || return 1
  if printf '%s' "$raw" | jq -e --arg k "$key" '
    (if type == "array" then . else (.preAuthKeys // .preauthkeys // .keys // []) end)
    | map(select(
        ((.key // .Key // "") | type) == "string"
        and ((.key // .Key // "") | length) > 0
        and (
          (.key // .Key) == $k
          or ($k | startswith(.key // .Key))
          or ((.key // .Key) | startswith($k))
        )
        and (.expired != true)
      ))
    | length > 0
  ' >/dev/null 2>&1; then
    return 0
  fi
  printf '%s' "$raw" | grep -F -q "$key"
}

create_api_key() {
  echo "Creating Headscale API key" >&2
  raw=$(hs apikeys create --expiration 8760h --output json)
  key=$(extract_key "$raw")
  if [ "${#key}" -lt 16 ]; then
    echo "Headscale did not return an API key" >&2
    exit 1
  fi
  if ! api_key_valid "$key"; then
    echo "Newly created HEADSCALE_API_KEY was rejected by Headscale" >&2
    exit 1
  fi
  printf '%s' "$key"
}

create_edge_key() {
  echo "Creating reusable tag:edge pre-auth key" >&2
  raw=$(hs preauthkeys create --user "$USER_NAME" --reusable --expiration 8760h --tags tag:edge --output json)
  key=$(extract_key "$raw")
  if [ "${#key}" -lt 16 ]; then
    echo "Headscale did not return an edge pre-auth key" >&2
    exit 1
  fi
  if ! edge_key_valid "$key"; then
    echo "Newly created APPS_EDGE_AUTHKEY was rejected by Headscale" >&2
    exit 1
  fi
  printf '%s' "$key"
}

# Prefer a value this Headscale accepts. File first (this volume), then env.
resolve_headscale_key() {
  name=$1
  kind=$2
  eval "env_value=\${$name:-}"
  env_value=$(printf '%s' "$env_value" | tr -d '\r\n')
  file_value=$(read_secret "$name" || true)
  file_value=$(printf '%s' "$file_value" | tr -d '\r\n')

  if [ -n "$file_value" ]; then
    if [ "$kind" = "api" ]; then
      api_key_valid "$file_value" && valid=1 || valid=0
    else
      edge_key_valid "$file_value" && valid=1 || valid=0
    fi
    if [ "$valid" -eq 1 ]; then
      if [ -n "$env_value" ] && [ "$env_value" != "$file_value" ]; then
        echo "Ignoring ${name} from the environment; secrets volume is valid for this Headscale" >&2
      else
        echo "Reusing ${name} from secrets volume" >&2
      fi
      printf '%s' "$file_value"
      return 0
    fi
    echo "${name} on the secrets volume is not valid for this Headscale" >&2
  fi

  if [ -n "$env_value" ]; then
    if [ "$kind" = "api" ]; then
      api_key_valid "$env_value" && valid=1 || valid=0
    else
      edge_key_valid "$env_value" && valid=1 || valid=0
    fi
    if [ "$valid" -eq 1 ]; then
      echo "Accepting ${name} from the environment; mirroring onto the secrets volume" >&2
      printf '%s' "$env_value"
      return 0
    fi
    echo "Ignoring ${name} from the environment; it is not valid for this Headscale" >&2
  fi

  if [ "$kind" = "api" ]; then
    create_api_key
  else
    create_edge_key
  fi
}

wait_ready

users=$(hs users list --output json 2>/dev/null || printf '%s' '[]')
if ! printf '%s' "$users" | grep -q "$USER_NAME"; then
  echo "Creating Headscale user ${USER_NAME}"
  hs users create "$USER_NAME" >/dev/null
fi

old_edge=$(read_secret APPS_EDGE_AUTHKEY || true)
old_edge=$(printf '%s' "$old_edge" | tr -d '\r\n')

api_key=$(resolve_headscale_key HEADSCALE_API_KEY api)
api_key=$(printf '%s' "$api_key" | tr -d '\r\n')
write_secret HEADSCALE_API_KEY "$api_key"

edge_key=$(resolve_headscale_key APPS_EDGE_AUTHKEY edge)
edge_key=$(printf '%s' "$edge_key" | tr -d '\r\n')
write_secret APPS_EDGE_AUTHKEY "$edge_key"

if [ -n "$old_edge" ] && [ "$old_edge" != "$edge_key" ]; then
  printf '1\n' > "${SECRETS}/EDGE_STATE_RESET"
  echo "Edge pre-auth key changed; tsnet state will be reset"
else
  rm -f "${SECRETS}/EDGE_STATE_RESET"
fi

if [ -n "${AUTH_SECRET:-}" ]; then
  write_secret AUTH_SECRET "$AUTH_SECRET"
elif [ ! -s "${SECRETS}/AUTH_SECRET" ]; then
  echo "Generating AUTH_SECRET"
  secret=$(openssl rand -base64 32 | tr -d '\n')
  write_secret AUTH_SECRET "$secret"
else
  echo "Reusing AUTH_SECRET from secrets volume"
fi

printf 'ok\n' > "${SECRETS}/READY"
chmod 644 "${SECRETS}/READY"
echo "Otterscale bootstrap complete"
