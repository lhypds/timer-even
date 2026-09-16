#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing npm dependencies"
npm install

# Vite 8 bundles with Rolldown. An interrupted install or npm's optional-deps
# bug can omit its platform package; recover from the committed lockfile.
if [ ! -f node_modules/@rolldown/pluginutils/dist/index.mjs ]; then
  echo "==> Rolldown install looks incomplete — reinstalling with npm ci"
  npm ci
fi

echo "==> Copying .env.example -> .env (if .env does not exist)"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "    Created .env. Point VITE_TIMER_URL at a local ../timer dev server for development."
else
  echo "    .env already exists, skipping."
fi

echo "==> Making helper scripts executable"
chmod +x setup.sh develop.sh simulate.sh login.sh package.sh 2>/dev/null || true

echo "==> Checking evenhub CLI (used by develop.sh and package.sh)"
if command -v evenhub >/dev/null 2>&1; then
  echo "    evenhub found: $(command -v evenhub)"
else
  echo "    evenhub not found on PATH."
  echo "    Install it per the Even Realities docs: https://hub.evenrealities.com/docs/getting-started/overview"
fi

echo
echo "Setup complete. Next:"
echo "  ./develop.sh   # dev server on 0.0.0.0:5173 (+ QR for the glasses)"
echo "  ./simulate.sh  # Even Hub simulator (run develop.sh first)"
echo "  ./package.sh   # production build + .ehpk package"
