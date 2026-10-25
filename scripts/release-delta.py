"""Create an exact copy/insert JSON delta against a retained release.

Usage: python3 scripts/release-delta.py BASE_HTML NEW_HTML OUTPUT_PREFIX
The gzip artifact contains JSON. Each ops item is either [base_offset, length]
to copy unchanged bytes, or a base64 string of bytes to insert. Never apply a
delta to a base whose SHA-256 does not match base_sha256.
"""

import base64
from bisect import bisect_left
import gzip
import hashlib
import json
from pathlib import Path
import sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def create(base, result, width=16, minimum=32):
    positions = {}
    for offset in range(len(base) - width + 1):
        positions.setdefault(base[offset:offset + width], []).append(offset)
    ops, literal = [], bytearray()
    cursor, anchor = 0, 0

    def flush():
        if literal:
            ops.append(base64.b64encode(literal).decode())
            literal.clear()

    while cursor < len(result):
        candidates = positions.get(result[cursor:cursor + width], [])
        if len(candidates) > 64:
            near = bisect_left(candidates, anchor)
            candidates = candidates[:16] + candidates[-16:] + candidates[max(0, near - 16):near + 16]
        best_offset, best_length = 0, 0
        for offset in candidates:
            length = width
            limit = min(len(base) - offset, len(result) - cursor)
            while length < limit and base[offset + length] == result[cursor + length]:
                length += 1
            if length > best_length:
                best_offset, best_length = offset, length
        if best_length >= minimum:
            flush()
            if ops and isinstance(ops[-1], list) and sum(ops[-1]) == best_offset:
                ops[-1][1] += best_length
            else:
                ops.append([best_offset, best_length])
            cursor += best_length
            anchor = best_offset + best_length
        else:
            literal.append(result[cursor])
            cursor += 1
    flush()
    return {
        "format": "pacman-copy-insert-v1",
        "base_sha256": digest(base),
        "result_sha256": digest(result),
        "base_bytes": len(base),
        "result_bytes": len(result),
        "ops": ops,
    }


if __name__ == "__main__":
    base_path, result_path, prefix = map(Path, sys.argv[1:4])
    base, result = base_path.read_bytes(), result_path.read_bytes()
    candidates = [create(base, result, width, minimum) for width, minimum in [(16, 32), (12, 20), (8, 12)]]
    delta = min(candidates, key=lambda item: len(gzip.compress(json.dumps(item, separators=(",", ":")).encode(), compresslevel=9, mtime=0)))
    reconstructed = b"".join(
        base[op[0]:op[0] + op[1]] if isinstance(op, list) else base64.b64decode(op, validate=True)
        for op in delta["ops"]
    )
    assert reconstructed == result, "Delta must reconstruct the exact target bytes."
    encoded = json.dumps(delta, separators=(",", ":")).encode()
    packed = gzip.compress(encoded, compresslevel=9, mtime=0)
    full = gzip.compress(result, compresslevel=9, mtime=0)
    prefix.with_suffix(".json").write_bytes(encoded)
    prefix.with_suffix(".json.gz").write_bytes(packed)
    prefix.with_suffix(".b64").write_text(base64.b64encode(packed).decode())
    print(json.dumps({
        "format": delta["format"], "base_sha256": digest(base), "result_sha256": digest(result),
        "base_bytes": len(base), "result_bytes": len(result), "ops": len(delta["ops"]),
        "delta_json_bytes": len(encoded), "delta_gzip_bytes": len(packed),
        "delta_gzip_sha256": digest(packed), "full_gzip_bytes": len(full),
        "delta_preferred": len(packed) < len(full), "reconstruction_verified": True,
    }))
