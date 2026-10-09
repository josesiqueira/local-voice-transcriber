"""Send one native messaging request to a host command, the way Chrome does.

Used by install.sh's self-check and by the slow tests.
Usage: native_client.py <host command> <audio file> [mime]
"""

import base64
import io
import json
import subprocess
import sys
from pathlib import Path

from native_protocol import decode_body, encode_message, read_frame


def call_host(command, request, env=None, timeout=900) -> dict:
    proc = subprocess.run(
        list(command) + ["chrome-extension://native-client/"],
        input=encode_message(request),
        capture_output=True,
        env=env,
        timeout=timeout,
    )
    return decode_body(read_frame(io.BytesIO(proc.stdout)))


def main(argv) -> int:
    if len(argv) < 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    audio = Path(argv[2]).read_bytes()
    mime = argv[3] if len(argv) > 3 else "audio/ogg; codecs=opus"
    reply = call_host([argv[1]], {"audio_b64": base64.b64encode(audio).decode(), "mime": mime})
    print(json.dumps(reply, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
