"""Chrome native messaging framing: a 32-bit length in native byte order, then UTF-8 JSON.

See developer.chrome.com/docs/extensions/develop/concepts/native-messaging.
"""

import json
import struct
from typing import Any, BinaryIO

_HEADER = struct.Struct("=I")  # native byte order, 4 bytes


class ProtocolError(Exception):
    """The input did not contain one complete frame."""


def encode_message(obj: Any) -> bytes:
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    return _HEADER.pack(len(body)) + body


def write_message(stream: BinaryIO, obj: Any) -> None:
    stream.write(encode_message(obj))
    stream.flush()


def _read_exactly(stream: BinaryIO, size: int) -> bytes:
    chunks = []
    remaining = size
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def read_frame(stream: BinaryIO) -> bytes:
    header = _read_exactly(stream, _HEADER.size)
    if not header:
        raise ProtocolError("no message on stdin")
    if len(header) < _HEADER.size:
        raise ProtocolError("incomplete header")
    (length,) = _HEADER.unpack(header)
    body = _read_exactly(stream, length)
    if len(body) < length:
        raise ProtocolError(f"incomplete body: expected {length} bytes, got {len(body)}")
    return body


def decode_body(body: bytes) -> Any:
    """Parse a frame body. Raises ValueError for invalid UTF-8 or JSON."""
    return json.loads(body.decode("utf-8"))
