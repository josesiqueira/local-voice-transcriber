from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

import config
import engine
from errors import HostError

MOCK_AUDIO = Path(__file__).resolve().parents[1] / "mock-audio.ogg"
SPEECHY = np.zeros(16000, dtype=np.float32)


class FakeModel:
    """Stands in for WhisperModel. `fail_on` names the step that raises on GPU."""

    instances = []

    def __init__(self, path, device, fail_on=None, text=" Hola mundo ", probs=None, **kwargs):
        self.path, self.device, self.kwargs = path, device, kwargs
        self.fail_on = fail_on if device == "cuda" else None
        self.text = text
        self.probs = probs or [("gl", 0.5), ("es", 0.4), ("en", 0.1)]
        FakeModel.instances.append(self)
        if self.fail_on == "load":
            raise RuntimeError("CUDA failed with error no CUDA-capable device is detected")

    def detect_language(self, audio, vad_filter):
        assert vad_filter is True
        return self.probs[0][0], self.probs[0][1], self.probs

    def transcribe(self, audio, language, beam_size, vad_filter):
        assert vad_filter is True and beam_size == config.BEAM_SIZE
        self.language_used = language

        def segments():
            if self.fail_on == "transcribe":
                raise RuntimeError("CUDA failed with error out of memory")
            yield SimpleNamespace(text=self.text)

        return segments(), SimpleNamespace(language=language)


def make(fail_on=None, **model_kwargs):
    FakeModel.instances = []

    def factory(path, device, **kwargs):
        return FakeModel(path, device, fail_on=fail_on, **model_kwargs, **kwargs)

    return engine.Transcriber(model_factory=factory, model_path_resolver=lambda: "/models/turbo")


def test_gpu_success_uses_cuda_settings_and_given_languages():
    result = make().transcribe(SPEECHY, languages=("es", "en"))
    assert result.text == "Hola mundo"
    assert result.language == "es"  # gl is ignored
    assert result.device == "cuda"
    gpu = FakeModel.instances[0]
    assert gpu.device == "cuda" and gpu.kwargs == {"compute_type": "int8_float16"}
    assert gpu.language_used == "es"
    assert set(result.timings) == {"load", "detect", "transcribe"}


def test_without_languages_the_detected_language_is_used():
    result = make().transcribe(SPEECHY)
    assert result.language == "gl"
    assert FakeModel.instances[0].language_used == "gl"


def test_empty_languages_use_the_detected_language():
    result = make().transcribe(SPEECHY, languages=())
    assert result.language == "gl"


def test_ties_between_given_languages_go_to_the_first_one():
    result = make(probs=[("de", 0.4), ("nl", 0.4)]).transcribe(SPEECHY, languages=("nl", "de"))
    assert result.language == "nl"


def test_cpu_fallback_keeps_the_given_languages():
    result = make(fail_on="transcribe").transcribe(SPEECHY, languages=("en",))
    assert result.device == "cpu"
    assert result.language == "en"
    assert FakeModel.instances[-1].language_used == "en"


def test_cuda_load_error_falls_back_to_cpu():
    result = make(fail_on="load").transcribe(SPEECHY)
    assert result.device == "cpu"
    cpu = FakeModel.instances[-1]
    assert cpu.device == "cpu"
    assert cpu.kwargs == {"compute_type": "int8", "cpu_threads": config.CPU_THREADS}


def test_cuda_error_during_transcription_falls_back_to_cpu():
    result = make(fail_on="transcribe").transcribe(SPEECHY)
    assert result.device == "cpu"
    assert result.text == "Hola mundo"


def test_empty_text_is_empty_transcription_and_not_retried_on_cpu():
    with pytest.raises(HostError) as info:
        make(text="   ").transcribe(SPEECHY)
    assert info.value.code == "empty_transcription"
    assert [m.device for m in FakeModel.instances] == ["cuda"]


def test_cpu_failure_after_gpu_failure_is_internal_error():
    def factory(path, device, **kwargs):
        raise RuntimeError(f"broken {device}")

    t = engine.Transcriber(model_factory=factory, model_path_resolver=lambda: "/m")
    with pytest.raises(HostError) as info:
        t.transcribe(SPEECHY)
    assert info.value.code == "internal_error"


def test_missing_model_is_reported_before_any_load():
    def resolver():
        raise HostError("model_missing", "Model not downloaded. Run install.sh")

    t = engine.Transcriber(model_factory=lambda *a, **k: pytest.fail("must not load"), model_path_resolver=resolver)
    with pytest.raises(HostError) as info:
        t.transcribe(SPEECHY)
    assert info.value.code == "model_missing"


def test_resolve_model_path_maps_missing_model(monkeypatch):
    with pytest.raises(HostError) as info:
        engine.resolve_model_path("Systran/this-model-does-not-exist-wat")
    assert info.value.code == "model_missing"


def test_decode_mock_ogg_gives_16khz_mono_float32():
    audio = engine.decode(MOCK_AUDIO.read_bytes())
    assert audio.dtype == np.float32
    assert audio.ndim == 1
    assert 1.8 * 16000 < audio.size < 2.2 * 16000


def test_decode_garbage_is_decode_failed():
    with pytest.raises(HostError) as info:
        engine.decode(b"this is not audio at all" * 10)
    assert info.value.code == "decode_failed"


def test_tone_has_no_speech():
    assert engine.has_speech(engine.decode(MOCK_AUDIO.read_bytes())) is False


def test_resolve_model_path_finds_the_pinned_revision_offline(monkeypatch):
    calls = {}

    def fake_download(name, **kwargs):
        calls.update(kwargs, name=name)
        return "/cache/snapshot"

    import faster_whisper.utils

    monkeypatch.setattr(faster_whisper.utils, "download_model", fake_download)
    assert engine.resolve_model_path() == "/cache/snapshot"
    assert calls == {"name": config.MODEL_NAME, "local_files_only": True, "revision": config.MODEL_REVISION}
