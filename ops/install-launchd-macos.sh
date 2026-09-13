#!/bin/bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${NOVA_VIX_LAUNCHD_LABEL:-com.ramon.nova-vix-chatgpt}"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
VIX_PORT="${NOVA_VIX_PORT:-18816}"
LOG_DIR="${NOVA_VIX_LOG_DIR:-$HOME/.nova/vix-chatgpt/logs}"
RELEASE_BASE="${NOVA_VIX_RELEASE_BASE:-$HOME/.nova/vix-chatgpt/releases}"
DRY_RUN="${NOVA_VIX_INSTALL_DRY_RUN:-0}"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
GIT_BIN="${GIT_BIN:-$(command -v git || true)}"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || { echo "Node executable missing" >&2; exit 2; }
[[ -n "$GIT_BIN" && -x "$GIT_BIN" ]] || { echo "Git executable missing" >&2; exit 3; }
[[ "$VIX_PORT" =~ ^[0-9]+$ ]] || { echo "NOVA_VIX_PORT must be numeric" >&2; exit 4; }
SOURCE_SHA="${NOVA_VIX_RELEASE_SHA:-$($GIT_BIN -C "$SOURCE_ROOT" rev-parse HEAD)}"
$GIT_BIN -C "$SOURCE_ROOT" cat-file -e "$SOURCE_SHA^{commit}"
ROOT="$RELEASE_BASE/$SOURCE_SHA"

xml_escape() {
  printf '%s' "$1" | /usr/bin/sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

NODE_XML="$(xml_escape "$NODE_BIN")"
ROOT_XML="$(xml_escape "$ROOT")"
HOME_XML="$(xml_escape "$HOME")"
LOG_XML="$(xml_escape "$LOG_DIR")"
LABEL_XML="$(xml_escape "$LABEL")"
LAUNCH_PATH="$HOME/.local/bin:$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PATH_XML="$(xml_escape "$LAUNCH_PATH")"
PLIST="$(mktemp "${TMPDIR:-/tmp}/nova-vix-chatgpt.XXXXXX.plist")"
trap 'rm -f "$PLIST"' EXIT

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL_XML</string>
  <key>ProgramArguments</key>
  <array><string>$NODE_XML</string><string>$ROOT_XML/src/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT_XML</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>$HOME_XML</string>
    <key>HOST</key><string>127.0.0.1</string>
    <key>PORT</key><string>$VIX_PORT</string>
    <key>NOVA_VIX_BIN</key><string>$ROOT_XML/runtime/vix-v0.6.0/vix</string>
    <key>PATH</key><string>$PATH_XML</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>$LOG_XML/stdout.log</string>
  <key>StandardErrorPath</key><string>$LOG_XML/stderr.log</string>
</dict>
</plist>
EOF

/usr/bin/plutil -lint "$PLIST" >/dev/null
if [[ "$DRY_RUN" == "1" ]]; then
  printf 'label=%s\nnode=%s\nroot=%s\nsource_sha=%s\nport=%s\npath=%s\nplist_valid=true\n' "$LABEL" "$NODE_BIN" "$ROOT" "$SOURCE_SHA" "$VIX_PORT" "$LAUNCH_PATH"
  exit 0
fi

NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
TAR_BIN="${TAR_BIN:-$(command -v tar || true)}"
[[ -n "$NPM_BIN" && -x "$NPM_BIN" ]] || { echo "npm executable missing" >&2; exit 5; }
[[ -n "$TAR_BIN" && -x "$TAR_BIN" ]] || { echo "tar executable missing" >&2; exit 6; }
mkdir -p "$RELEASE_BASE" "$LOG_DIR" "$HOME/Library/LaunchAgents"
if [[ ! -d "$ROOT" ]]; then
  STAGE="$(mktemp -d "$RELEASE_BASE/.stage-$SOURCE_SHA.XXXXXX")"
  trap 'rm -f "$PLIST"; rm -rf "${STAGE:-}"' EXIT
  $GIT_BIN -C "$SOURCE_ROOT" archive "$SOURCE_SHA" | "$TAR_BIN" -x -C "$STAGE"
  (cd "$STAGE" && "$NPM_BIN" ci --omit=dev)
  (cd "$STAGE" && /bin/bash scripts/install-vix.sh)
  printf '%s\n' "$SOURCE_SHA" > "$STAGE/.release-sha"
  /bin/mv "$STAGE" "$ROOT"
  STAGE=""
fi
[[ -f "$ROOT/src/server.mjs" ]] || { echo "Release server entrypoint missing: $ROOT" >&2; exit 7; }
[[ -d "$ROOT/node_modules/@modelcontextprotocol/server" ]] || { echo "Release dependencies missing: $ROOT" >&2; exit 8; }
[[ -x "$ROOT/runtime/vix-v0.6.0/vix" && -x "$ROOT/runtime/vix-v0.6.0/vixd" ]] || { echo "Release Vix runtime missing: $ROOT" >&2; exit 9; }
/usr/bin/install -m 0644 "$PLIST" "$TARGET"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
bootstrap_ok=0
bootstrap_error=''
for attempt in 1 2 3 4 5; do
  if bootstrap_error="$(launchctl bootstrap "$DOMAIN" "$TARGET" 2>&1)"; then
    bootstrap_ok=1
    break
  fi
  sleep 1
done
if [[ "$bootstrap_ok" != "1" ]]; then
  echo "launchd bootstrap failed after 5 attempts: $bootstrap_error" >&2
  exit 10
fi
launchctl kickstart -k "$DOMAIN/$LABEL"
launchctl print "$DOMAIN/$LABEL"
