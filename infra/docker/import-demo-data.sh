#!/usr/bin/env bash
# Import or re-import demo data (Docker or local with data layer running).
#
# Examples:
#   ./import-demo-data.sh              # skip if already imported
#   ./import-demo-data.sh --force      # clear demo rows and re-import
#   FORCE_REIMPORT=true ./import-demo-data.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
FORCE="${FORCE_REIMPORT:-}"

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
  esac
done

if docker compose -f "${SCRIPT_DIR}/docker-compose.yml" ps mysql 2>/dev/null | grep -q 'Up\|running'; then
  echo "[import-demo-data] Running bootstrap via migrate container…"
  export FORCE_REIMPORT="${FORCE}"
  docker compose -f "${SCRIPT_DIR}/docker-compose.yml" --profile app run --rm \
    -e "FORCE_REIMPORT=${FORCE_REIMPORT}" \
    migrate
  exit 0
fi

echo "[import-demo-data] MySQL container not running — using local npm bootstrap…"
cd "${REPO_ROOT}/infra/migrations"
npm install --silent 2>/dev/null || npm install
npm run migrate
npm run seed
if [ "${FORCE}" = "true" ]; then
  npm run bootstrap -- --force
else
  npm run bootstrap
fi
