#!/bin/sh
# One-shot: MySQL migrate → seed users → import demo data (idempotent).
set -eu

cd /app/infra/migrations

echo "[migrate] Waiting for MySQL and running migrations…"
i=0
max=30
until npm run migrate; do
  i=$((i + 1))
  if [ "$i" -ge "$max" ]; then
    echo "[migrate] migrate failed after ${max} retries"
    exit 1
  fi
  echo "[migrate] Waiting for MySQL (${i}/${max})…"
  sleep 2
done

echo "[migrate] Running user seed…"
npm run seed

echo "[migrate] Running demo bootstrap…"
if [ "${FORCE_REIMPORT:-}" = "true" ] || [ "${FORCE_REIMPORT:-}" = "1" ]; then
  npm run bootstrap -- --force
else
  npm run bootstrap
fi

echo "[migrate] All bootstrap steps completed."
