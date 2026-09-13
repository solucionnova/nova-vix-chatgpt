#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VIX_VERSION:-v0.6.0}"
OS="${VIX_INSTALL_OS:-$(uname -s)}"
ARCH="${VIX_INSTALL_ARCH:-$(uname -m)}"
DRY_RUN="${VIX_INSTALL_DRY_RUN:-0}"

[[ "$VERSION" == "v0.6.0" ]] || { echo "Unsupported Vix version: $VERSION" >&2; exit 2; }

case "$OS:$ARCH" in
  Darwin:arm64|Darwin:aarch64)
    ASSET="vix-darwin-arm64.tar.gz"
    EXPECTED_SHA="d93a4919d5d0fbea6f1f294a81cf5b588a75ef9ea16bf77247761765e506dd67"
    ;;
  Linux:x86_64|Linux:amd64)
    ASSET="vix-linux-amd64.tar.gz"
    EXPECTED_SHA="169cb08785a6dcd6e39c27f865d024b9a30516000b900fd5632c73b6c9380108"
    ;;
  Linux:arm64|Linux:aarch64)
    ASSET="vix-linux-arm64.tar.gz"
    EXPECTED_SHA="4eea109ae7e561b39a5850dfd4f82bf2ca9fc73f280a13e7ed1b7a57e043b987"
    ;;
  *) echo "Unsupported Vix platform: $OS/$ARCH" >&2; exit 2 ;;
esac

if [[ "$DRY_RUN" == "1" ]]; then
  printf 'version=%s\nos=%s\narch=%s\nasset=%s\nsha256=%s\n' "$VERSION" "$OS" "$ARCH" "$ASSET" "$EXPECTED_SHA"
  exit 0
fi

CURL="$(command -v curl || true)"
TAR="$(command -v tar || true)"
INSTALL="$(command -v install || true)"
[[ -n "$CURL" && -n "$TAR" && -n "$INSTALL" ]] || { echo "Required tools missing: curl, tar and install are required" >&2; exit 6; }

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    echo "No SHA-256 tool found (sha256sum or shasum required)" >&2
    return 1
  fi
}

TARGET="$ROOT/runtime/vix-$VERSION"
mkdir -p "$ROOT/runtime"
TMP="$(mktemp -d "$ROOT/runtime/.install-vix.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/$ASSET"

if [[ -n "${VIX_ARCHIVE:-}" ]]; then
  cp "$VIX_ARCHIVE" "$ARCHIVE"
else
  "$CURL" --fail --location --silent --show-error \
    "https://github.com/get-vix/vix/releases/download/$VERSION/$ASSET" \
    --output "$ARCHIVE"
fi

ACTUAL_SHA="$(sha256_file "$ARCHIVE")"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
  echo "Vix checksum mismatch: expected $EXPECTED_SHA, got $ACTUAL_SHA" >&2
  exit 3
fi

mkdir -p "$TMP/extracted"
"$TAR" -xzf "$ARCHIVE" -C "$TMP/extracted"
SOURCE="$TMP/extracted/${ASSET%.tar.gz}"
[[ -f "$SOURCE/vix" && -f "$SOURCE/vixd" ]] || { echo "Vix archive layout unexpected" >&2; exit 4; }

mkdir -p "$TARGET"
"$INSTALL" -m 0755 "$SOURCE/vix" "$TARGET/vix"
"$INSTALL" -m 0755 "$SOURCE/vixd" "$TARGET/vixd"
printf '%s  %s\n' "$EXPECTED_SHA" "$ASSET" > "$TARGET/.sha256"
chmod 0600 "$TARGET/.sha256"

VERSION_OUTPUT="$($TARGET/vix -version 2>&1)"
[[ "$VERSION_OUTPUT" == *"0.6.0"* ]] || { echo "Unexpected Vix version: $VERSION_OUTPUT" >&2; exit 5; }
printf 'installed=%s\nasset=%s\nsha256=%s\nversion=%s\n' "$TARGET" "$ASSET" "$EXPECTED_SHA" "$VERSION_OUTPUT"
