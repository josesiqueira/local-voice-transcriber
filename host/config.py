"""All tunable settings of the native host, in one place."""

import os
from pathlib import Path

MODEL_NAME = "large-v3-turbo"
# Exact model version (a commit of mobiuslabsgmbh/faster-whisper-large-v3-turbo on Hugging Face),
# so every install gets the same files.
MODEL_REVISION = "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"

GPU_DEVICE = "cuda"
GPU_COMPUTE_TYPE = "int8_float16"
CPU_DEVICE = "cpu"
CPU_COMPUTE_TYPE = "int8"
CPU_THREADS = max(1, (os.cpu_count() or 2) // 2)  # about one thread per physical core

BEAM_SIZE = 5

MAX_AUDIO_BYTES = 40 * 1024 * 1024  # keep equal to MAX_AUDIO_BYTES in extension/content.js
MAX_REPLY_BYTES = 1024 * 1024  # Chrome's limit for one message from the host

LOG_DIR = Path(os.environ.get("WAT_LOG_DIR", Path.home() / ".local" / "state" / "local-voice-transcriber"))
LOG_FILE = LOG_DIR / "host.log"
