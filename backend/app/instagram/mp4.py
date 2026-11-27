"""Just enough of the MP4 container to validate an upload and read its length (#1482)."""

from __future__ import annotations

import struct


def looks_like_mp4(data: bytes) -> bool:
    """An ISO base media file starts with an ``ftyp`` box (4 size bytes, then the type)."""
    return len(data) >= 12 and data[4:8] == b"ftyp"


def _boxes(data: bytes, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack_from(">I4s", data, pos)
        header = 8
        if size == 1:
            if pos + 16 > end:
                return
            size = struct.unpack_from(">Q", data, pos + 8)[0]
            header = 16
        elif size == 0:
            size = end - pos
        if size < header or pos + size > end:
            return
        yield kind, pos + header, pos + size
        pos += size


def duration_ms(data: bytes) -> int | None:
    """Length of the video from moov/mvhd, or None when the header is missing or odd."""
    for kind, body, end in _boxes(data, 0, len(data)):
        if kind != b"moov":
            continue
        for inner, ibody, iend in _boxes(data, body, end):
            if inner != b"mvhd" or iend - ibody < 20:
                continue
            version = data[ibody]
            if version == 1 and iend - ibody >= 32:
                timescale, duration = struct.unpack_from(">IQ", data, ibody + 20)
            elif version == 0:
                timescale, duration = struct.unpack_from(">II", data, ibody + 12)
            else:
                return None
            return round(duration * 1000 / timescale) if timescale else None
    return None
