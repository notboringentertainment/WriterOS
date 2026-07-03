#!/usr/bin/env bash
# Copy opensrc-cached package source into repos/ for Cursor @-mentions.
# Usage: ./scripts/opensrc-vendor.sh react zod vercel/vite

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/repos"

if command -v opensrc >/dev/null 2>&1; then
  OPENSRC=(opensrc)
else
  OPENSRC=(npx --yes opensrc)
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <package-or-repo> [more...]" >&2
  echo "Example: $0 react react-dom" >&2
  exit 1
fi

mkdir -p "$DEST"

errors=0
for spec in "$@"; do
  echo "Fetching $spec ..."
  if ! "${OPENSRC[@]}" fetch "$spec"; then
    echo "Failed to fetch: $spec" >&2
    errors=$((errors + 1))
    continue
  fi
  if ! SRC="$("${OPENSRC[@]}" path "$spec")"; then
    echo "Could not resolve path for: $spec" >&2
    errors=$((errors + 1))
    continue
  fi
  if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "Could not resolve path for: $spec" >&2
    errors=$((errors + 1))
    continue
  fi
  SAFE="${spec//\//--}"
  TARGET="$DEST/$SAFE"
  rm -rf "$TARGET"
  mkdir -p "$(dirname "$TARGET")"
  cp -R "$SRC" "$TARGET"
  echo "Vendored → $TARGET"
done

if [ "$errors" -gt 0 ]; then
  echo "$errors package(s) failed to vendor." >&2
  exit 1
fi

echo "Done. Reference paths under repos/ in Agent prompts."
