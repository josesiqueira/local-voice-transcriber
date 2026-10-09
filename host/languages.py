"""Pick the transcription language from Whisper's language probabilities."""

from typing import Iterable, Sequence


def pick_language(probabilities: Iterable[tuple[str, float]], allowed: Sequence[str]) -> str:
    """Return the allowed language with the highest probability.

    Languages outside `allowed` are ignored. An allowed language missing from
    `probabilities` counts as 0. Ties go to the language that comes first in
    `allowed`, so the result is always one of `allowed`.
    """
    if not allowed:
        raise ValueError("allowed must not be empty")
    scores = {code: 0.0 for code in allowed}
    for code, probability in probabilities:
        if code in scores and probability > scores[code]:
            scores[code] = probability
    best = allowed[0]
    for code in allowed:
        if scores[code] > scores[best]:
            best = code
    return best
