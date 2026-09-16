#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Start the Even Hub simulator pointing at the dev server (run develop.sh first).
evenhub-simulator "http://localhost:${DEV_PORT:-5173}/"
