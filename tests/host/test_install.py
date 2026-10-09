"""Runs install.sh and uninstall.sh against a temporary HOME. Slow: syncs the venv again."""

import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
REAL_HOME = Path.home()
MANIFEST = Path(".config/google-chrome/NativeMessagingHosts/io.github.josesiqueira.local_voice_transcriber.json")


def run(script, home, *args):
    env = dict(
        os.environ,
        HOME=str(home),
        HF_HOME=os.environ.get("HF_HOME", str(REAL_HOME / ".cache" / "huggingface")),
        UV_CACHE_DIR=os.environ.get("UV_CACHE_DIR", str(REAL_HOME / ".cache" / "uv")),
        PATH=f"{REAL_HOME / '.local' / 'bin'}:{os.environ['PATH']}",
    )
    env.pop("WAT_LOG_DIR", None)
    return subprocess.run([str(ROOT / script), *args], env=env, capture_output=True, text=True, timeout=1800)


@pytest.mark.slow
def test_install_then_uninstall_leaves_only_the_model(tmp_path):
    first = run("install.sh", tmp_path)
    assert first.returncode == 0, first.stdout + first.stderr
    manifest = json.loads((tmp_path / MANIFEST).read_text())
    assert manifest["name"] == "io.github.josesiqueira.local_voice_transcriber"
    assert manifest["type"] == "stdio"
    assert manifest["path"] == str(ROOT / "host" / "run-host.sh")
    assert len(manifest["allowed_origins"]) == 1
    assert "Self-check passed" in first.stdout

    again = run("install.sh", tmp_path)  # safe to run twice
    assert again.returncode == 0, again.stdout + again.stderr

    gone = run("uninstall.sh", tmp_path)
    assert gone.returncode == 0, gone.stdout + gone.stderr
    assert not (tmp_path / MANIFEST).exists()
    assert not (tmp_path / ".local" / "state" / "local-voice-transcriber").exists()
    assert not (ROOT / "host" / ".venv").exists()
    shared = tmp_path / ".cache" / "Microsoft" / "DeveloperTools"
    # onnxruntime may create a Microsoft device ID file here; uninstall leaves it because other tools share it.
    leftovers = [p for p in tmp_path.rglob("*") if p.is_file() and shared not in p.parents]
    assert leftovers == []

    # restore the venv for the rest of the work
    restore = subprocess.run([str(REAL_HOME / ".local/bin/uv"), "sync"], cwd=ROOT / "host", capture_output=True, text=True)
    assert restore.returncode == 0, restore.stderr


def test_install_help_prints_the_usage_header():
    # Exits while reading the options, before anything is installed.
    proc = subprocess.run([str(ROOT / "install.sh"), "--help"], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0
    lines = proc.stdout.splitlines()
    assert lines[0].startswith("Installs the Local Voice Transcriber host")
    assert lines[1] == "Usage: ./install.sh"
    assert "popup" in lines[2]
    assert "set -euo pipefail" not in proc.stdout


def test_install_has_no_languages_option():
    proc = subprocess.run([str(ROOT / "install.sh"), "--languages", "de"], capture_output=True, text=True, timeout=30)
    assert proc.returncode == 1
    assert "Unknown option: --languages" in proc.stderr
