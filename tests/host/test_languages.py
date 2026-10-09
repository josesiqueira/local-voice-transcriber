import re
from pathlib import Path

import pytest
from faster_whisper.tokenizer import _LANGUAGE_CODES

from languages import pick_language

ROOT = Path(__file__).resolve().parents[2]

# Example list with close neighbours of its languages in the inputs (gl next to es, af next to nl).
ALLOWED = ("es", "en", "nl", "de")


def test_picks_highest_allowed_language():
    assert pick_language([("en", 0.2), ("es", 0.7), ("de", 0.1)], ALLOWED) == "es"


def test_ignores_afrikaans_even_when_highest():
    probs = [("af", 0.6), ("nl", 0.3), ("en", 0.05)]
    assert pick_language(probs, ALLOWED) == "nl"


def test_ignores_galician_for_spanish():
    probs = [("gl", 0.5), ("de", 0.2), ("es", 0.25)]
    assert pick_language(probs, ALLOWED) == "es"


def test_tie_goes_to_earlier_language_in_allowed_order():
    assert pick_language([("de", 0.4), ("en", 0.4)], ALLOWED) == "en"


def test_all_allowed_absent_gives_first_allowed():
    assert pick_language([("af", 0.9), ("fr", 0.1)], ALLOWED) == "es"


def test_empty_probabilities_gives_first_allowed():
    assert pick_language([], ALLOWED) == "es"


def test_single_allowed_language():
    assert pick_language([("en", 0.9), ("nl", 0.1)], ("nl",)) == "nl"


def test_order_of_input_does_not_matter():
    a = [("nl", 0.3), ("de", 0.5)]
    assert pick_language(a, ALLOWED) == pick_language(list(reversed(a)), ALLOWED) == "de"


def test_empty_allowed_is_an_error():
    with pytest.raises(ValueError):
        pick_language([("en", 1.0)], ())


def test_extension_language_list_is_whispers_list_in_the_same_order():
    source = (ROOT / "extension" / "languages.js").read_text(encoding="utf-8")
    match = re.search(r"WHISPER_LANGUAGES = \[(.*?)\];", source, re.S)
    assert match, "extension/languages.js must define WHISPER_LANGUAGES"
    assert tuple(re.findall(r'"([^"]*)"', match.group(1))) == _LANGUAGE_CODES
