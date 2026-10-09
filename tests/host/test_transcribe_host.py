import base64
import io
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import transcribe_host
from engine import Result
from errors import HostError
from native_protocol import encode_message, read_frame, decode_body

ROOT = Path(__file__).resolve().parents[2]
MOCK_AUDIO = (ROOT / "tests" / "mock-audio.ogg").read_bytes()


class FakeTranscriber:
    def __init__(self, result=None, error=None):
        self.result = result or Result("café ä \U0001F642", "en", "cuda", {"load": 1.0})
        self.error = error
        self.calls = 0
        self.languages = None

    def transcribe(self, audio, languages=()):
        self.calls += 1
        self.languages = languages
        if self.error:
            raise self.error
        return self.result


def body(obj):
    return json.dumps(obj).encode("utf-8")


def request(audio=MOCK_AUDIO, **fields):
    return body({"audio_b64": base64.b64encode(audio).decode(), "mime": "audio/ogg", **fields})


def speech_stub(_audio):
    return True


def test_success_reply():
    reply = transcribe_host.handle_request(request(), FakeTranscriber(), has_speech=speech_stub)
    assert reply == {"ok": True, "text": "café ä \U0001F642", "language": "en", "device": "cuda"}


@pytest.mark.parametrize(
    "raw",
    [b"{not json", body([1, 2]), body({"mime": "audio/ogg"}), body({"audio_b64": ""}), body({"audio_b64": 5})],
)
def test_bad_requests_are_invalid_request(raw):
    reply = transcribe_host.handle_request(raw, FakeTranscriber())
    assert reply["ok"] is False and reply["error"] == "invalid_request"


def test_without_languages_any_language_is_used():
    fake = FakeTranscriber()
    transcribe_host.handle_request(request(), fake, has_speech=speech_stub)
    assert fake.languages == ()


def test_empty_languages_means_any_language():
    fake = FakeTranscriber()
    transcribe_host.handle_request(request(languages=[]), fake, has_speech=speech_stub)
    assert fake.languages == ()


def test_languages_reach_the_transcriber_in_request_order():
    fake = FakeTranscriber()
    reply = transcribe_host.handle_request(request(languages=["nl", "de", "en"]), fake, has_speech=speech_stub)
    assert reply["ok"] is True
    assert fake.languages == ("nl", "de", "en")


def test_every_whisper_language_is_accepted():
    from faster_whisper.tokenizer import _LANGUAGE_CODES

    fake = FakeTranscriber()
    transcribe_host.handle_request(request(languages=list(_LANGUAGE_CODES)), fake, has_speech=speech_stub)
    assert fake.languages == tuple(_LANGUAGE_CODES)


@pytest.mark.parametrize(
    "languages",
    [
        ["de", "xx"],  # not a Whisper language
        ["EN"],  # codes are lowercase
        "de,en",  # not a list
        {"de": True},
        ["de", "nl", "de"],  # duplicate
        ["de", 5],  # not a string
        ["de", None],
        [["de"]],
        ["de"] * 101,  # more than 100
        None,
    ],
)
def test_bad_languages_are_invalid_request(languages):
    fake = FakeTranscriber()
    reply = transcribe_host.handle_request(request(languages=languages), fake, has_speech=speech_stub)
    assert reply["ok"] is False and reply["error"] == "invalid_request"
    assert fake.calls == 0


def test_invalid_base64_is_invalid_request():
    reply = transcribe_host.handle_request(body({"audio_b64": "@@@not base64@@@"}), FakeTranscriber())
    assert reply["error"] == "invalid_request"


def test_too_large_audio(monkeypatch):
    monkeypatch.setattr(transcribe_host.config, "MAX_AUDIO_BYTES", 10)
    reply = transcribe_host.handle_request(request(b"x" * 11), FakeTranscriber())
    assert reply["error"] == "audio_too_large"


def test_undecodable_audio_is_decode_failed():
    reply = transcribe_host.handle_request(request(b"garbage" * 50), FakeTranscriber())
    assert reply["error"] == "decode_failed"


def test_silence_is_empty_transcription_without_model():
    fake = FakeTranscriber()
    reply = transcribe_host.handle_request(request(), fake)  # real VAD: a tone has no speech
    assert reply["error"] == "empty_transcription"
    assert fake.calls == 0


def test_host_error_from_engine_becomes_reply():
    fake = FakeTranscriber(error=HostError("model_missing", "Model not downloaded. Run install.sh"))
    reply = transcribe_host.handle_request(request(), fake, has_speech=speech_stub)
    assert reply == {"ok": False, "error": "model_missing", "message": "Model not downloaded. Run install.sh"}


def test_unexpected_exception_becomes_internal_error():
    fake = FakeTranscriber(error=ZeroDivisionError("boom"))
    reply = transcribe_host.handle_request(request(), fake, has_speech=speech_stub)
    assert reply["error"] == "internal_error"


# The subprocess tests run main() in a child process with a fake transcriber that
# also writes junk to stdout from Python and from the file descriptor, the way a
# noisy library would. stdout must still contain exactly one valid frame.
CHILD = r"""
import os, sys
sys.path.insert(0, sys.argv[1])
import transcribe_host
from engine import Result

class Noisy:
    def transcribe(self, audio, languages=()):
        print("python print to stdout")
        os.write(1, b"raw fd 1 write\n")
        os.write(2, b"raw fd 2 write\n")
        return Result(("speech " * int(sys.argv[2])).strip(), "en", "cuda", {})

transcribe_host.engine.has_speech = lambda audio: True
sys.exit(transcribe_host.main(["host", "chrome-extension://test/"], make_transcriber=Noisy))
"""


def run_child(stdin_bytes, tmp_path, repeat="1", log_dir=None):
    env = dict(os.environ, WAT_LOG_DIR=str(log_dir or tmp_path / "logs"))
    proc = subprocess.run(
        [sys.executable, "-c", CHILD, str(ROOT / "host"), repeat],
        input=stdin_bytes,
        capture_output=True,
        env=env,
        timeout=120,
    )
    return proc


def test_stdout_carries_exactly_one_frame(tmp_path):
    proc = run_child(encode_message(json.loads(request())), tmp_path)
    assert proc.returncode == 0
    stream = io.BytesIO(proc.stdout)
    reply = decode_body(read_frame(stream))
    assert reply["ok"] is True and reply["text"] == "speech"
    assert isinstance(reply["seconds"], float)
    assert stream.read() == b""  # nothing after the frame
    log = (tmp_path / "logs" / "host.log").read_text()
    assert "raw fd 1 write" in log and "python print to stdout" in log
    assert "word" not in log  # transcription text is never logged


# main() in a child process whose transcriber tries to open sockets and reports what happened.
NETWORK_CHILD = r"""
import socket, sys
sys.path.insert(0, sys.argv[1])
import transcribe_host
from engine import Result

def attempt(family, kind=socket.SOCK_STREAM):
    try:
        socket.socket(family, kind).close()
        return "open"
    except PermissionError:
        return "refused"

class Probe:
    def transcribe(self, audio, languages=()):
        tries = [attempt(socket.AF_INET), attempt(socket.AF_INET6), attempt(socket.AF_INET, socket.SOCK_DGRAM), attempt(socket.AF_UNIX)]
        return Result(" ".join(tries), "en", "cpu", {})

def broken_block():
    raise OSError("seccomp unavailable")

transcribe_host.engine.has_speech = lambda audio: True
block = broken_block if sys.argv[2] == "broken" else transcribe_host.netblock.ensure
sys.exit(transcribe_host.main(["host", "chrome-extension://test/"], make_transcriber=Probe, block_network=block))
"""


def run_network_child(tmp_path, block):
    proc = subprocess.run(
        [sys.executable, "-c", NETWORK_CHILD, str(ROOT / "host"), block],
        input=encode_message(json.loads(request())),
        capture_output=True,
        env=dict(os.environ, WAT_LOG_DIR=str(tmp_path / "logs")),
        timeout=120,
    )
    return decode_body(read_frame(io.BytesIO(proc.stdout)))


def test_the_kernel_refuses_network_sockets_during_a_transcription(tmp_path):
    reply = run_network_child(tmp_path, "real")
    assert reply["text"] == "refused refused refused open"  # IPv4, IPv6, UDP refused; local socket allowed
    assert "network_blocked=True" in (tmp_path / "logs" / "host.log").read_text()


def test_nothing_is_transcribed_when_the_network_block_fails(tmp_path):
    reply = run_network_child(tmp_path, "broken")
    assert reply["ok"] is False and reply["error"] == "network_block_failed"
    assert "seccomp unavailable" in (tmp_path / "logs" / "host.log").read_text()


def test_empty_stdin_replies_invalid_request(tmp_path):
    proc = run_child(b"", tmp_path)
    reply = decode_body(read_frame(io.BytesIO(proc.stdout)))
    assert reply["error"] == "invalid_request"


def test_truncated_frame_replies_invalid_request(tmp_path):
    proc = run_child(encode_message({"audio_b64": "AAAA"})[:-3], tmp_path)
    reply = decode_body(read_frame(io.BytesIO(proc.stdout)))
    assert reply["error"] == "invalid_request"


def test_reply_over_one_megabyte_becomes_reply_too_large(tmp_path):
    proc = run_child(encode_message(json.loads(request())), tmp_path, repeat="200000")
    reply = decode_body(read_frame(io.BytesIO(proc.stdout)))
    assert reply["error"] == "reply_too_large"


def test_run_host_sh_starts_the_venv_python(tmp_path):
    env = dict(os.environ, WAT_LOG_DIR=str(tmp_path / "logs"))
    proc = subprocess.run(
        [str(ROOT / "host" / "run-host.sh"), "chrome-extension://test/"],
        input=encode_message({"audio_b64": base64.b64encode(MOCK_AUDIO).decode(), "mime": "audio/ogg"}),
        capture_output=True,
        env=env,
        timeout=120,
    )
    reply = decode_body(read_frame(io.BytesIO(proc.stdout)))
    assert reply["error"] == "empty_transcription"  # a tone: the whole path works, no model needed


def test_run_host_sh_turns_off_network_use_by_libraries(tmp_path):
    # A copy of run-host.sh next to a stand-in python that records the environment it gets.
    host = tmp_path / "host"
    (host / ".venv" / "lib" / "python3.12" / "site-packages").mkdir(parents=True)
    script = host / "run-host.sh"
    script.write_bytes((ROOT / "host" / "run-host.sh").read_bytes())
    script.chmod(0o755)
    fake_python = host / ".venv" / "bin" / "python"
    fake_python.parent.mkdir()
    fake_python.write_text(f'#!/bin/sh\nenv > "{tmp_path / "env.txt"}"\n')
    fake_python.chmod(0o755)
    subprocess.run([str(script)], check=True, timeout=30)
    env = (tmp_path / "env.txt").read_text().splitlines()
    for setting in ("HF_HUB_OFFLINE=1", "HF_HUB_DISABLE_TELEMETRY=1", "ORT_DISABLE_TELEMETRY=1"):
        assert setting in env


def test_unwritable_log_folder_still_gives_one_reply(tmp_path):
    blocker = tmp_path / "not-a-folder"
    blocker.write_text("a regular file, so the log folder cannot be created under it")
    proc = run_child(encode_message(json.loads(request())), tmp_path / "unused", log_dir=blocker / "logs")
    stream = io.BytesIO(proc.stdout)
    reply = decode_body(read_frame(stream))
    assert reply["ok"] is True and reply["text"] == "speech"
    assert stream.read() == b""
