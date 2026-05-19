#!/usr/bin/env bash
# Copy opensrc-cached package source into repos/ for Cursor @-mentions.
# Usage: ./scripts/opensrc-vendor.sh react zod vercel/vite

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/repos"

if ! command -v opensrc >/dev/null 2>&1; then
  echo "opensrc CLI not found. Install: npm install -g opensrc" >&2
  exit 1
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <package-or-repo> [more...]" >&2
  echo "Example: $0 react react-dom" >&2
  exit 1
fi

mkdir -p "$DEST"

for spec in "$@"; do
  echo "Fetching $spec ..."
  opensrc fetch "$spec"
  SRC="$(opensrc path "$spec")"
  if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "Could not resolve path for: $spec" >&2
    exit 1
  fi
  SAFE="${spec//\//--}"
  TARGET="$DEST/$SAFE"
  rm -rf "$TARGET"
  mkdir -p "$(dirname "$TARGET")"
  cp -R "$SRC" "$TARGET"
  echo "Vendored → $TARGET"
done

echo "Done. Reference paths under repos/ in Agent prompts."
