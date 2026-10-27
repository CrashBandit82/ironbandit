#!/bin/sh
# Downloads the pinned SQLite amalgamation so the sqlite3 package compiles
# SQLite from source instead of downloading a prebuilt library
# (see hooks.user_defines in pubspec.yaml).
set -eu
VERSION=3530400   # SQLite 3.53.4
YEAR=2026
SHA256=1e71ddf93849c6a6ecf58b827c0692073d2dd7ee40196158068f7b29f422e87d
DEST="$(dirname "$0")/../third_party/sqlite"
[ -f "$DEST/sqlite3.c" ] && [ "$(cat "$DEST/VERSION" 2>/dev/null)" = "$VERSION" ] && exit 0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/sqlite.zip" "https://sqlite.org/$YEAR/sqlite-amalgamation-$VERSION.zip"
echo "$SHA256  $TMP/sqlite.zip" | sha256sum -c - >/dev/null
unzip -q -o "$TMP/sqlite.zip" -d "$TMP"
mkdir -p "$DEST"
cp "$TMP/sqlite-amalgamation-$VERSION/sqlite3.c" "$TMP/sqlite-amalgamation-$VERSION/sqlite3.h" "$DEST/"
echo "$VERSION" > "$DEST/VERSION"
echo "SQLite $VERSION -> $DEST"
