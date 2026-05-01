#!/usr/bin/env sh
# kubeaquarium installer.
#
# Usage:
#   curl -sSfL https://raw.githubusercontent.com/gabriel-dantas98/kubeaquarium/main/scripts/install.sh | sh
#
# Env:
#   KUBEAQUARIUM_VERSION   pin a version (default: latest)
#   PREFIX                 install dir   (default: /usr/local/bin, then $HOME/.local/bin)

set -eu

REPO="gabriel-dantas98/kubeaquarium"
BIN="kubeaquarium"

VERSION="${KUBEAQUARIUM_VERSION:-latest}"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

case "$OS" in
  darwin|linux) ;;
  *) echo "unsupported os: $OS  — for Windows please download a release archive from https://github.com/$REPO/releases" >&2; exit 1 ;;
esac

# Resolve version
if [ "$VERSION" = "latest" ]; then
  if command -v curl >/dev/null 2>&1; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  elif command -v wget >/dev/null 2>&1; then
    VERSION=$(wget -qO- "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  else
    echo "need curl or wget" >&2; exit 1
  fi
  if [ -z "$VERSION" ]; then
    echo "could not resolve latest version — set KUBEAQUARIUM_VERSION explicitly" >&2; exit 1
  fi
fi

# Trim leading "v" for the archive name (goreleaser default)
SHORT="${VERSION#v}"
ARCHIVE="${BIN}_${SHORT}_${OS}_${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/${VERSION}/${ARCHIVE}"

echo "→ Downloading $BIN $VERSION ($OS/$ARCH)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP/$ARCHIVE"
else
  wget -qO "$TMP/$ARCHIVE" "$URL"
fi

tar -xzf "$TMP/$ARCHIVE" -C "$TMP"

# Pick install dir
if [ -z "${PREFIX:-}" ]; then
  if [ -w "/usr/local/bin" ] || [ "$(id -u)" = "0" ]; then
    PREFIX="/usr/local/bin"
  else
    PREFIX="$HOME/.local/bin"
    mkdir -p "$PREFIX"
  fi
fi

DEST="$PREFIX/$BIN"
install -m 0755 "$TMP/$BIN" "$DEST" 2>/dev/null || cp "$TMP/$BIN" "$DEST" && chmod 0755 "$DEST"

echo "✔ installed: $DEST"
case ":$PATH:" in
  *":$PREFIX:"*) ;;
  *) echo "  add to PATH:  echo 'export PATH=\"$PREFIX:\$PATH\"' >> ~/.profile" ;;
esac

echo
echo "next:  $BIN"
