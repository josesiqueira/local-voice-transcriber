#!/usr/bin/env bash
# Installs the Local Voice Transcriber host for Google Chrome. Safe to run more than once.
# Usage: ./install.sh
#   Detection languages are chosen in the extension's popup (its icon in the Chrome toolbar).
set -euo pipefail

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,4p' "$0" | cut -c3-; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="io.github.josesiqueira.local_voice_transcriber"
EXTENSION_ID="aclgfofogdialjfpeplknjloiemchjcf"
MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
MANIFEST="$MANIFEST_DIR/$HOST_NAME.json"
PY="$ROOT/host/.venv/bin/python"

UV="$(command -v uv || true)"
[ -n "$UV" ] || UV="$HOME/.local/bin/uv"
if [ ! -x "$UV" ]; then
  echo "uv not found. Install it first: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi
if [ ! -x /usr/bin/google-chrome ]; then
  echo "Google Chrome not found at /usr/bin/google-chrome" >&2
  exit 1
fi

echo "[1/5] Python environment (host/.venv)"
(cd "$ROOT/host" && "$UV" sync --quiet)

export HF_HUB_DISABLE_TELEMETRY=1
export ORT_DISABLE_TELEMETRY=1
# Keeps the model file inside its own cache folder, so deleting that folder removes it.
export HF_HUB_DISABLE_SHARED_BLOBS=1
echo "[2/5] Whisper model (about 1.6 GB on the first run, skipped when already downloaded)"
"$PY" - "$ROOT/host" <<'EOF'
import sys
sys.path.insert(0, sys.argv[1])
import config
from faster_whisper.utils import download_model
print("      model folder:", download_model(config.MODEL_NAME, revision=config.MODEL_REVISION))
EOF

echo "[3/5] Launcher"
chmod +x "$ROOT/host/run-host.sh"

echo "[4/5] Host manifest: $MANIFEST"
mkdir -p "$MANIFEST_DIR"
"$PY" - "$MANIFEST" "$HOST_NAME" "$ROOT/host/run-host.sh" "$EXTENSION_ID" <<'EOF'
import json, sys
out, name, path, ext_id = sys.argv[1:5]
manifest = {
    "name": name,
    "description": "Local Whisper transcriber for WhatsApp Web voice notes",
    "path": path,
    "type": "stdio",
    "allowed_origins": [f"chrome-extension://{ext_id}/"],
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
EOF

echo "[5/5] Self-check (runs the host once on a short tone, the way Chrome would)"
REPLY="$("$PY" "$ROOT/host/native_client.py" "$ROOT/host/run-host.sh" "$ROOT/tests/mock-audio.ogg")"
echo "      reply: $REPLY"
if echo "$REPLY" | grep -q '"empty_transcription"\|"ok": true'; then
  echo "      Self-check passed"
else
  echo "      Self-check failed. See ~/.local/state/local-voice-transcriber/host.log" >&2
  exit 1
fi

cat <<EOF

Done. Extension ID: $EXTENSION_ID
Next: open chrome://extensions, turn on Developer mode, click "Load unpacked"
and choose: $ROOT/extension
EOF
