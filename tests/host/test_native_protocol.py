import io
import struct

import pytest

from native_protocol import ProtocolError, decode_body, encode_message, read_frame, write_message


def test_round_trip_keeps_multibyte_text():
    message = {"text": "café, naïve, 中文, \U0001F642", "n": 1}
    data = encode_message(message)
    assert decode_body(read_frame(io.BytesIO(data))) == message


def test_length_prefix_is_native_order_byte_count_of_utf8_body():
    data = encode_message({"t": "ä"})
    (length,) = struct.unpack("=I", data[:4])
    body = data[4:]
    assert length == len(body)
    assert body.decode("utf-8") == '{"t": "ä"}'


def test_write_message_writes_one_frame_and_flushes():
    stream = io.BytesIO()
    write_message(stream, {"ok": True})
    assert stream.getvalue() == encode_message({"ok": True})


def test_empty_stream_raises():
    with pytest.raises(ProtocolError, match="no message"):
        read_frame(io.BytesIO(b""))


def test_short_header_raises():
    with pytest.raises(ProtocolError, match="header"):
        read_frame(io.BytesIO(b"\x01\x00"))


def test_truncated_body_raises():
    data = encode_message({"a": "b"})[:-2]
    with pytest.raises(ProtocolError, match="body"):
        read_frame(io.BytesIO(data))


def test_reads_exactly_one_frame():
    stream = io.BytesIO(encode_message({"a": 1}) + encode_message({"b": 2}))
    assert decode_body(read_frame(stream)) == {"a": 1}


def test_decode_body_rejects_invalid_json():
    with pytest.raises(ValueError):
        decode_body(b"{not json")


def test_decode_body_rejects_invalid_utf8():
    with pytest.raises(ValueError):
        decode_body(b"\xff\xfe")
