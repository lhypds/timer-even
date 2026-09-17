#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

APP_JSON="app.json"
DIST_DIR="dist"

echo "==> Checking evenhub CLI"
if ! command -v evenhub >/dev/null 2>&1; then
  echo "    evenhub not found on PATH."
  echo "    Install it: npm i -g @evenrealities/evenhub-cli"
  echo "    Docs: https://hub.evenrealities.com/docs/getting-started/overview"
  exit 1
fi

PACKAGE_ID="$(node -p "require('./$APP_JSON').package_id" 2>/dev/null || echo app)"
VERSION="$(node -p "require('./$APP_JSON').version" 2>/dev/null || echo 0.0.0)"
PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo 0.0.0)"
OUTPUT="${PACKAGE_ID}-${VERSION}.ehpk"

if [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "    app.json version ($VERSION) and package.json version ($PKG_VERSION) differ. Bump with: npm version <patch|minor|major>" >&2
  exit 1
fi

# A packaged app must embed the public website; a .env left pointing at a
# local timer would ship a package that loads nothing on a phone.
if [ -n "${VITE_TIMER_URL:-}" ]; then
  echo "    VITE_TIMER_URL is set in the environment ($VITE_TIMER_URL); unset it to package." >&2
  exit 1
fi
if [ -f .env ] && grep -Eq '^VITE_TIMER_URL=http://' .env; then
  echo "    .env points VITE_TIMER_URL at a local server; restore https://timer.gcc3.com/ to package." >&2
  exit 1
fi

echo "==> Running tests"
npm test

echo "==> Building web app"
npm run build

if [ ! -d "$DIST_DIR" ]; then
  echo "    Build did not produce '$DIST_DIR/'. Aborting." >&2
  exit 1
fi

echo "==> Packing into $OUTPUT"
evenhub pack "$APP_JSON" "$DIST_DIR" -o "$OUTPUT"

shopt -s nullglob
for OLD in "${PACKAGE_ID}"-*.ehpk; do
  [ "$OLD" = "$OUTPUT" ] && continue
  OLD_VERSION="${OLD#"${PACKAGE_ID}"-}"
  OLD_VERSION="${OLD_VERSION%.ehpk}"
  # only drop packages strictly older than the one just built
  if [ "$(printf '%s\n%s\n' "$OLD_VERSION" "$VERSION" | sort -V | head -n1)" = "$OLD_VERSION" ]; then
    rm -f "$OLD"
    echo "    Removed old package $OLD"
  fi
done
shopt -u nullglob

echo
echo "Done: $OUTPUT"
echo "Next: upload it at https://hub.evenrealities.com/hub/${PACKAGE_ID}"
