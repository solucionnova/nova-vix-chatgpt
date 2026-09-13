#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${NOVA_VIX_LAUNCHD_LABEL:-com.nova.vix-chatgpt}"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
PORT="${PORT:-18816}"
LOG_DIR="${NOVA_VIX_LOG_DIR:-$HOME/.nova/vix-chatgpt/logs}"
DRY_RUN="${NOVA_VIX_INSTALL_DRY_RUN:-0}"

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || { echo "Node executable missing" >&2; exit 2; }
[[ -x "$ROOT/runtime/vix-v0.6.0/vix" && -x "$ROOT/runtime/vix-v0.6.0/vixd" ]] || { echo "Connector-local Vix v0.6.0 missing" >&2; exit 3; }
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric" >&2; exit 4; }

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
    <key>PORT</key><string>$PORT</string>
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
  printf 'label=%s\nnode=%s\nroot=%s\nport=%s\npath=%s\nplist_valid=true\n' "$LABEL" "$NODE_BIN" "$ROOT" "$PORT" "$LAUNCH_PATH"
  exit 0
fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
/usr/bin/install -m 0644 "$PLIST" "$TARGET"
launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$TARGET"
launchctl kickstart -k "$DOMAIN/$LABEL"
launchctl print "$DOMAIN/$LABEL"
