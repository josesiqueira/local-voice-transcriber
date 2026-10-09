#!/usr/bin/env bash
# Chrome starts this for each native message (see the host manifest written by install.sh).
# stdout carries protocol bytes only, so this script prints nothing.
set -euo pipefail

HOST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HOST_DIR/.venv"

SITE=""
for dir in "$VENV"/lib/python3.*/site-packages; do SITE="$dir"; done

# CUDA 12 runtime libraries come from pip wheels inside the venv, not from the system.
export LD_LIBRARY_PATH="$SITE/nvidia/cublas/lib:$SITE/nvidia/cudnn/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
# A click never touches the network: install.sh downloads the model beforehand.
export HF_HUB_OFFLINE=1
export HF_HUB_DISABLE_TELEMETRY=1
# onnxruntime (faster-whisper's speech filter) otherwise sends usage telemetry to Microsoft.
export ORT_DISABLE_TELEMETRY=1

exec "$VENV/bin/python" "$HOST_DIR/transcribe_host.py" "$@"
