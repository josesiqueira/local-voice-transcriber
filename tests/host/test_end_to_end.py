"""Real model runs through run-host.sh. Slow: run with -m slow. Prints measured times."""

import base64
import os
import subprocess
import time
from pathlib import Path

import pytest

from native_client import call_host

ROOT = Path(__file__).resolve().parents[2]
AUDIO_DIR = ROOT / "tests" / "audio"
HOST = [str(ROOT / "host" / "run-host.sh")]
SAMPLES = sorted(AUDIO_DIR.glob("*.ogg")) if AUDIO_DIR.exists() else []
# Optional: the language code the samples are spoken in. When unset, only a non-empty code is checked.
SAMPLE_LANGUAGE = os.environ.get("WAT_SAMPLE_LANGUAGE")


def check_language(language):
    if SAMPLE_LANGUAGE:
        assert language == SAMPLE_LANGUAGE
    else:
        assert isinstance(language, str) and language

pytestmark = pytest.mark.slow


def vram_used_mib() -> int:
    out = subprocess.run(
        ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, check=True,
    ).stdout
    return int(out.strip().splitlines()[0])


def compute_apps() -> str:
    """CUDA compute processes only. Desktop graphics processes (Xorg, browser) are not listed."""
    return subprocess.run(
        ["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def transcribe(path: Path, env=None):
    request = {"audio_b64": base64.b64encode(path.read_bytes()).decode(), "mime": "audio/ogg; codecs=opus"}
    started = time.monotonic()
    reply = call_host(HOST, request, env=env)
    return reply, time.monotonic() - started


@pytest.mark.skipif(not SAMPLES, reason="no samples in tests/audio")
@pytest.mark.parametrize("sample", SAMPLES, ids=lambda p: p.name)
def test_gpu_transcribes_and_detects_language(sample):
    before = vram_used_mib()
    reply, wall = transcribe(sample)
    assert reply["ok"] is True, reply
    assert reply["device"] == "cuda"
    check_language(reply["language"])
    assert len(reply["text"].split()) >= 3
    print(f"\nGPU {sample.name}: wall {wall:.2f}s host {reply['seconds']}s text={reply['text'][:80]!r}")
    assert subprocess.run(["pgrep", "-f", r"python.*transcribe_host\.py"], capture_output=True).stdout == b""
    after = vram_used_mib()
    print(f"VRAM before {before} MiB, after {after} MiB")
    # The desktop (browser, compositor) moves VRAM by tens of MiB on its own, so the exact
    # check is "no compute process left"; the model needs well over 1 GiB, so 300 MiB catches a leak.
    assert compute_apps() == ""
    assert after <= before + 300


@pytest.mark.skipif(not SAMPLES, reason="no samples in tests/audio")
@pytest.mark.parametrize("name", ["speech-short.ogg", "speech-30s.ogg"])
def test_cpu_fallback_when_cuda_is_unavailable(name):
    sample = AUDIO_DIR / name
    if not sample.exists():
        pytest.skip(f"{name} missing")
    env = dict(os.environ, CUDA_VISIBLE_DEVICES="-1")
    reply, wall = transcribe(sample, env=env)
    assert reply["ok"] is True, reply
    assert reply["device"] == "cpu"
    check_language(reply["language"])
    print(f"\nCPU {name}: wall {wall:.2f}s host {reply['seconds']}s")
