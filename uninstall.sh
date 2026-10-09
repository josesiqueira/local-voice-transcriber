#!/usr/bin/env bash
# Removes what install.sh created. Add --remove-model to also delete the downloaded Whisper model.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="io.github.josesiqueira.local_voice_transcriber"
# faster-whisper maps large-v3-turbo (host/config.py) to this Hugging Face repository.
MODEL_REPO="mobiuslabsgmbh/faster-whisper-large-v3-turbo"
MODEL_FOLDER="models--${MODEL_REPO//\//--}"
HUB="${HF_HUB_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}/hub}"

# The model goes first: deleting it uses huggingface_hub from host/.venv, removed below.
if [ "${1:-}" = "--remove-model" ]; then
  if [ -x "$ROOT/host/.venv/bin/python" ]; then
    # The cache manager also deletes the model file when huggingface_hub keeps it in the
    # cache-wide shared store (hub/blobs), which removing the model folder alone would leave.
    "$ROOT/host/.venv/bin/python" - "$MODEL_REPO" "$HUB" <<'PYEOF'
import sys
from huggingface_hub import scan_cache_dir

repo_id, hub = sys.argv[1], sys.argv[2]
cache = scan_cache_dir(hub)
repos = [r for r in cache.repos if r.repo_id == repo_id and r.repo_type == "model"]
if repos:
    strategy = cache.delete_revisions(*[rev.commit_hash for r in repos for rev in r.revisions])
    strategy.execute()
    print(f"Removed the model ({strategy.expected_freed_size_str}) from {hub}.")
else:
    print(f"No model found in {hub}.")
PYEOF
  fi
  # Without host/.venv (or for a folder the cache manager did not list) remove the folder directly.
  rm -rf "${HUB:?}/$MODEL_FOLDER"
  rm -rf "${HUB:?}/.locks/$MODEL_FOLDER"
fi

rm -f "$HOME/.config/google-chrome/NativeMessagingHosts/$HOST_NAME.json"
rm -rf "$ROOT/host/.venv"
rm -rf "${WAT_LOG_DIR:-$HOME/.local/state/local-voice-transcriber}"
# onnxruntime's own folder; the deviceid file next to it is shared with other Microsoft tools.
rm -rf "$HOME/.cache/Microsoft/DeveloperTools/.onnxruntime"
echo "Removed the host manifest, host/.venv and the logs."

if [ "${1:-}" != "--remove-model" ]; then
  echo "Kept the model in $HUB/$MODEL_FOLDER (run with --remove-model to delete it)."
fi

cat <<EOF
Also:
- Remove the extension in chrome://extensions (this deletes its cached transcripts).
- ~/.cache/Microsoft/DeveloperTools/deviceid may have been created by onnxruntime. Other Microsoft tools use the same file, so it is left in place.
- uv keeps downloaded wheels in its shared cache; "uv cache clean" removes them for all projects.
EOF
