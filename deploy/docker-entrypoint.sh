#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ]; then
  mkdir -p /data
  echo "Applying database migrations (prisma migrate deploy)..."
  prisma migrate deploy
fi

exec node server.js
