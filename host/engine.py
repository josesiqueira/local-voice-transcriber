"""Decoding, speech check, and Whisper inference with GPU to CPU fallback.

faster-whisper is imported inside functions so the host starts fast and the
unit tests can run without loading a model.
"""

import gc
import io
import logging
import time
from dataclasses import dataclass, field

import numpy as np

import config
from errors import HostError
from languages import pick_language

log = logging.getLogger("wat.engine")

SAMPLE_RATE = 16000


@dataclass
class Result:
    text: str
    language: str
    device: str
    timings: dict = field(default_factory=dict)


def decode(audio_bytes: bytes) -> np.ndarray:
    """Decode any container PyAV understands (WhatsApp uses Ogg/Opus) to 16 kHz mono float32."""
    from faster_whisper.audio import decode_audio

    try:
        audio = decode_audio(io.BytesIO(audio_bytes), sampling_rate=SAMPLE_RATE)
    except Exception as exc:
        raise HostError("decode_failed", f"Could not decode audio ({type(exc).__name__})") from exc
    if audio.size == 0:
        raise HostError("decode_failed", "Audio has no samples")
    return audio


def has_speech(audio: np.ndarray) -> bool:
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    return bool(get_speech_timestamps(audio, VadOptions()))


def resolve_model_path(name: str = config.MODEL_NAME, revision: str = config.MODEL_REVISION) -> str:
    """Find the pinned model version in the local cache only. The host never downloads."""
    from faster_whisper.utils import download_model

    try:
        return download_model(name, local_files_only=True, revision=revision)
    except Exception as exc:
        raise HostError("model_missing", "Model not downloaded. Run install.sh") from exc


def _whisper_model(path, device, **kwargs):
    from faster_whisper import WhisperModel

    return WhisperModel(path, device=device, **kwargs)


class Transcriber:
    def __init__(self, model_factory=_whisper_model, model_path_resolver=resolve_model_path):
        self._model_factory = model_factory
        self._resolve_model_path = model_path_resolver

    def transcribe(self, audio: np.ndarray, languages: tuple[str, ...] = ()) -> Result:
        """Detection picks among `languages` (order breaks ties); empty means any language."""
        path = self._resolve_model_path()
        try:
            return self._attempt(path, audio, languages, config.GPU_DEVICE, compute_type=config.GPU_COMPUTE_TYPE)
        except HostError:
            raise
        except Exception as exc:
            log.warning("GPU attempt failed, using CPU: %s: %s", type(exc).__name__, exc)
        gc.collect()
        try:
            return self._attempt(
                path,
                audio,
                languages,
                config.CPU_DEVICE,
                compute_type=config.CPU_COMPUTE_TYPE,
                cpu_threads=config.CPU_THREADS,
            )
        except HostError:
            raise
        except Exception as exc:
            log.exception("CPU attempt failed")
            raise HostError("internal_error", f"Transcription failed ({type(exc).__name__})") from exc

    def _attempt(self, path, audio, languages, device, **model_kwargs) -> Result:
        timings = {}
        started = time.monotonic()
        model = self._model_factory(path, device, **model_kwargs)
        timings["load"] = round(time.monotonic() - started, 3)

        started = time.monotonic()
        detected, _, probabilities = model.detect_language(audio=audio, vad_filter=True)
        language = pick_language(probabilities, languages) if languages else detected
        timings["detect"] = round(time.monotonic() - started, 3)

        started = time.monotonic()
        segments, _info = model.transcribe(
            audio, language=language, beam_size=config.BEAM_SIZE, vad_filter=True
        )
        # segments is a lazy generator: CUDA errors surface here, inside the attempt.
        text = "".join(segment.text for segment in segments).strip()
        timings["transcribe"] = round(time.monotonic() - started, 3)

        log.info("device=%s language=%s timings=%s chars=%d", device, language, timings, len(text))
        if not text:
            raise HostError("empty_transcription", "No speech found in this message")
        return Result(text=text, language=language, device=device, timings=timings)
