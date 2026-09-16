#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Usage:
#   ./login.sh
#   ./login.sh you@example.com
# The email defaults to $EVENHUB_EMAIL when set.

echo "==> Checking evenhub CLI"
if ! command -v evenhub >/dev/null 2>&1; then
  echo "    evenhub not found on PATH."
  echo "    Install it: npm i -g @evenrealities/evenhub-cli"
  echo "    Docs: https://hub.evenrealities.com/docs/getting-started/overview"
  exit 1
fi

if evenhub whoami >/dev/null 2>&1; then
  echo "==> Already logged in as: $(evenhub whoami 2>/dev/null)"
  exit 0
fi

EMAIL="${1:-${EVENHUB_EMAIL:-}}"
echo "==> Logging in to EvenHub"
if [ -n "$EMAIL" ]; then
  evenhub login -e "$EMAIL"
else
  evenhub login
fi

echo
echo "==> Logged in. Next: ./package.sh"
