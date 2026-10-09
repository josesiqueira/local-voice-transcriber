"""Chrome native messaging host: read one request, transcribe, write one reply, exit.

Request: {"audio_b64": "...", "mime": "audio/ogg; codecs=opus", "languages": ["de", "en"]}
         "languages" is optional: Whisper codes that limit detection; missing or empty means any language.
Reply:   {"ok": true, "text": ..., "language": ..., "device": ..., "seconds": ...}
     or  {"ok": false, "error": <code>, "message": <text>}
"""

import time

_STARTED = time.monotonic()

import base64  # noqa: E402
import binascii  # noqa: E402
import logging  # noqa: E402
import logging.handlers  # noqa: E402
import os  # noqa: E402
import sys  # noqa: E402

import netblock  # noqa: E402

if __name__ == "__main__":
    # Block the network before any third-party library below is imported. main() calls
    # ensure() again and turns a failure into an error reply.
    try:
        netblock.ensure()
    except OSError:
        pass

import config  # noqa: E402
import engine  # noqa: E402
from errors import HostError  # noqa: E402
from native_protocol import ProtocolError, decode_body, encode_message, read_frame  # noqa: E402

log = logging.getLogger("wat.host")


def _error(code: str, message: str) -> dict:
    return {"ok": False, "error": code, "message": message}


def setup_io():
    """Keep a private copy of stdout for protocol bytes; send fd 1 and 2 to the log file.

    If the log file cannot be opened, fd 1 and 2 go to the null device and logging
    is discarded, so the request is still read and the reply still written.
    """
    protocol_out = os.fdopen(os.dup(1), "wb")
    handler = None
    try:
        config.LOG_DIR.mkdir(parents=True, exist_ok=True)
        sink = os.open(config.LOG_FILE, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            handler = logging.handlers.RotatingFileHandler(config.LOG_FILE, maxBytes=1_000_000, backupCount=2)
        except OSError:
            os.close(sink)
            raise
    except OSError:
        sink = os.open(os.devnull, os.O_WRONLY)
    os.dup2(sink, 1)
    os.dup2(sink, 2)
    os.close(sink)
    sys.stdout = open(1, "w", buffering=1, encoding="utf-8", closefd=False)
    sys.stderr = open(2, "w", buffering=1, encoding="utf-8", closefd=False)

    if handler is None:
        handler = logging.NullHandler()
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(process)d %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    return protocol_out


def requested_languages(message: dict) -> tuple[str, ...]:
    """The optional "languages" field as a tuple, in the order given. Missing means any language."""
    from faster_whisper.tokenizer import _LANGUAGE_CODES

    languages = message.get("languages", [])
    if not isinstance(languages, list) or len(languages) > len(_LANGUAGE_CODES):
        raise HostError("invalid_request", "languages must be a list of Whisper language codes")
    if not all(isinstance(code, str) and code in _LANGUAGE_CODES for code in languages):
        raise HostError("invalid_request", "languages holds an unknown language code")
    if len(set(languages)) != len(languages):
        raise HostError("invalid_request", "languages holds a code twice")
    return tuple(languages)


def handle_request(body: bytes, transcriber, *, decode=None, has_speech=None) -> dict:
    decode = decode or engine.decode
    has_speech = has_speech or engine.has_speech
    try:
        try:
            message = decode_body(body)
        except ValueError:
            raise HostError("invalid_request", "Request is not valid JSON")
        if not isinstance(message, dict):
            raise HostError("invalid_request", "Request is not a JSON object")
        languages = requested_languages(message)
        audio_b64 = message.get("audio_b64")
        if not isinstance(audio_b64, str) or not audio_b64:
            raise HostError("invalid_request", "audio_b64 is missing")
        if len(audio_b64) > (config.MAX_AUDIO_BYTES * 4) // 3 + 4:
            raise HostError("audio_too_large", "Audio is too large to transcribe")
        try:
            audio_bytes = base64.b64decode(audio_b64, validate=True)
        except (binascii.Error, ValueError):
            raise HostError("invalid_request", "audio_b64 is not valid base64")
        if len(audio_bytes) > config.MAX_AUDIO_BYTES:
            raise HostError("audio_too_large", "Audio is too large to transcribe")
        log.info("request bytes=%d mime=%s languages=%s", len(audio_bytes), message.get("mime"), ",".join(languages) or "any")

        started = time.monotonic()
        audio = decode(audio_bytes)
        log.info("decoded seconds_of_audio=%.1f in %.3fs", audio.size / engine.SAMPLE_RATE, time.monotonic() - started)
        if not has_speech(audio):
            raise HostError("empty_transcription", "No speech found in this message")

        result = transcriber.transcribe(audio, languages=languages)
        return {"ok": True, "text": result.text, "language": result.language, "device": result.device}
    except HostError as exc:
        log.info("error %s: %s", exc.code, exc.message)
        return _error(exc.code, exc.message)
    except Exception as exc:
        log.exception("unexpected failure")
        return _error("internal_error", f"Transcription failed ({type(exc).__name__})")


def main(argv=None, make_transcriber=None, stdin=None, block_network=netblock.ensure) -> int:
    argv = sys.argv if argv is None else argv
    # Before any audio is read, the kernel must refuse this process every network socket.
    try:
        block_network()
        block_error = None
    except OSError as exc:
        block_error = exc
    protocol_out = setup_io()
    stdin = stdin or sys.stdin.buffer
    log.info("start origin=%s network_blocked=%s", argv[1] if len(argv) > 1 else "", block_error is None)
    try:
        try:
            body = read_frame(stdin)
        except ProtocolError as exc:
            reply = _error("invalid_request", f"Bad message frame: {exc}")
        else:
            if block_error is not None:
                log.error("network block failed, not transcribing: %s", block_error)
                reply = _error("network_block_failed", "Could not block network access, so nothing was transcribed")
            else:
                reply = handle_request(body, (make_transcriber or engine.Transcriber)())
    except Exception as exc:  # never leave Chrome without a reply
        log.exception("unexpected failure in main")
        reply = _error("internal_error", f"Transcription failed ({type(exc).__name__})")

    if reply["ok"]:
        reply["seconds"] = round(time.monotonic() - _STARTED, 2)
    data = encode_message(reply)
    if len(data) - 4 > config.MAX_REPLY_BYTES:
        reply = _error("reply_too_large", "Transcript too long to return")
        data = encode_message(reply)
    protocol_out.write(data)
    protocol_out.flush()
    log.info("reply ok=%s error=%s seconds=%s", reply["ok"], reply.get("error"), reply.get("seconds"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
