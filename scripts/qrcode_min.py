"""Minimal QR Code encoder (byte mode, error correction level M, versions 1 to 10).

No dependency, enough for a URL on a printed login sheet. Follows ISO/IEC 18004 (and
the structure of Project Nayuki's reference implementation). Verified module by module
against ``segno`` for every mask in ``backend/tests/test_login_sheets.py``.

    matrix = encode("https://shopflow.rapidfox.io")   # list of rows of booleans (True = dark)
    svg = to_svg(matrix)                               # inline SVG with a 4-module quiet zone
"""

from __future__ import annotations

# Level M, indexed by version (0 unused).
ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
FORMAT_BITS_M = 0  # level M is encoded as 00 in the format information
MAX_VERSION = 10


def raw_modules(version: int) -> int:
    result = (16 * version + 128) * version + 64
    if version >= 2:
        count = version // 7 + 2
        result -= (25 * count - 10) * count - 55
        if version >= 7:
            result -= 36
    return result


def data_codewords(version: int) -> int:
    return raw_modules(version) // 8 - ECC_PER_BLOCK[version] * NUM_BLOCKS[version]


def alignment_positions(version: int) -> list[int]:
    if version == 1:
        return []
    count = version // 7 + 2
    step = 26 if version == 32 else (version * 4 + count * 2 + 1) // (count * 2 - 2) * 2
    positions = [6]
    last = version * 4 + 10
    for index in range(count - 1):
        positions.insert(1, last - index * step)
    return positions


def gf_multiply(x: int, y: int) -> int:
    z = 0
    for i in reversed(range(8)):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z


def rs_divisor(degree: int) -> list[int]:
    result = [0] * (degree - 1) + [1]
    root = 1
    for _ in range(degree):
        for j in range(degree):
            result[j] = gf_multiply(result[j], root)
            if j + 1 < degree:
                result[j] ^= result[j + 1]
        root = gf_multiply(root, 0x02)
    return result


def rs_remainder(data: list[int], divisor: list[int]) -> list[int]:
    result = [0] * len(divisor)
    for byte in data:
        factor = byte ^ result.pop(0)
        result.append(0)
        for i, coefficient in enumerate(divisor):
            result[i] ^= gf_multiply(coefficient, factor)
    return result


def choose_version(length: int, minimum: int = 1) -> int:
    for version in range(minimum, MAX_VERSION + 1):
        count_bits = 8 if version < 10 else 16
        if 4 + count_bits + 8 * length <= data_codewords(version) * 8:
            return version
    raise ValueError("text too long for this small QR encoder")


def codewords(payload: bytes, version: int, *, extra_zero_byte: bool = False) -> list[int]:
    """Data + error correction codewords. ``extra_zero_byte`` reproduces segno's padding (tests only):
    it adds a zero byte when the stream is already byte-aligned; both forms decode identically."""
    bits: list[int] = []

    def append(value: int, length: int) -> None:
        bits.extend((value >> i) & 1 for i in reversed(range(length)))

    append(0b0100, 4)  # byte mode
    append(len(payload), 8 if version < 10 else 16)
    for byte in payload:
        append(byte, 8)
    capacity = data_codewords(version) * 8
    append(0, min(4, capacity - len(bits)))
    append(0, (-len(bits)) % 8 or (8 if extra_zero_byte and len(bits) < capacity else 0))
    pad = 0xEC
    while len(bits) < capacity:
        append(pad, 8)
        pad ^= 0xEC ^ 0x11
    data = [int("".join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    # Split into blocks, add error correction, interleave.
    blocks_count, ecc_len = NUM_BLOCKS[version], ECC_PER_BLOCK[version]
    raw = raw_modules(version) // 8
    short_blocks = blocks_count - raw % blocks_count
    short_len = raw // blocks_count
    divisor = rs_divisor(ecc_len)
    blocks, index = [], 0
    for number in range(blocks_count):
        size = short_len - ecc_len + (0 if number < short_blocks else 1)
        chunk = data[index:index + size]
        index += size
        ecc = rs_remainder(chunk, divisor)
        if number < short_blocks:
            chunk = chunk + [0]
        blocks.append(chunk + ecc)
    result = []
    for i in range(len(blocks[0])):
        for j, block in enumerate(blocks):
            if i != short_len - ecc_len or j >= short_blocks:
                result.append(block[i])
    return result


MASKS = [
    lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0, lambda x, y: (x + y) % 3 == 0,
    lambda x, y: (x // 3 + y // 2) % 2 == 0, lambda x, y: x * y % 2 + x * y % 3 == 0,
    lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0, lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0,
]


class Grid:
    def __init__(self, version: int) -> None:
        self.version = version
        self.size = version * 4 + 17
        self.dark = [[False] * self.size for _ in range(self.size)]
        self.function = [[False] * self.size for _ in range(self.size)]

    def set(self, x: int, y: int, dark: bool) -> None:
        self.dark[y][x] = dark
        self.function[y][x] = True

    def draw_function_patterns(self) -> None:
        size = self.size
        for i in range(size):
            self.set(6, i, i % 2 == 0)
            self.set(i, 6, i % 2 == 0)
        for cx, cy in ((3, 3), (size - 4, 3), (3, size - 4)):
            for dy in range(-4, 5):
                for dx in range(-4, 5):
                    x, y = cx + dx, cy + dy
                    if 0 <= x < size and 0 <= y < size:
                        self.set(x, y, max(abs(dx), abs(dy)) not in (2, 4))
        positions = alignment_positions(self.version)
        last = len(positions) - 1
        for i, x in enumerate(positions):
            for j, y in enumerate(positions):
                if (i, j) in ((0, 0), (0, last), (last, 0)):
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        self.set(x + dx, y + dy, max(abs(dx), abs(dy)) != 1)
        self.draw_format(0)
        if self.version >= 7:
            remainder = self.version
            for _ in range(12):
                remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1F25)
            bits = self.version << 12 | remainder
            for i in range(18):
                bit = (bits >> i) & 1 == 1
                a, b = size - 11 + i % 3, i // 3
                self.set(a, b, bit)
                self.set(b, a, bit)

    def draw_format(self, mask: int) -> None:
        size = self.size
        data = FORMAT_BITS_M << 3 | mask
        remainder = data
        for _ in range(10):
            remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537)
        bits = (data << 10 | remainder) ^ 0x5412
        bit = lambda i: (bits >> i) & 1 == 1  # noqa: E731
        for i in range(6):
            self.set(8, i, bit(i))
        self.set(8, 7, bit(6))
        self.set(8, 8, bit(7))
        self.set(7, 8, bit(8))
        for i in range(9, 15):
            self.set(14 - i, 8, bit(i))
        for i in range(8):
            self.set(size - 1 - i, 8, bit(i))
        for i in range(8, 15):
            self.set(8, size - 15 + i, bit(i))
        self.set(8, size - 8, True)

    def draw_codewords(self, data: list[int]) -> None:
        size, index = self.size, 0
        right = size - 1
        while right >= 1:
            if right == 6:
                right = 5
            for vertical in range(size):
                for j in range(2):
                    x = right - j
                    upward = ((right + 1) & 2) == 0
                    y = size - 1 - vertical if upward else vertical
                    if not self.function[y][x] and index < len(data) * 8:
                        self.dark[y][x] = (data[index >> 3] >> (7 - (index & 7))) & 1 == 1
                        index += 1
            right -= 2

    def apply_mask(self, mask: int) -> None:
        rule = MASKS[mask]
        for y in range(self.size):
            for x in range(self.size):
                if not self.function[y][x] and rule(x, y):
                    self.dark[y][x] = not self.dark[y][x]

    def penalty(self) -> int:
        size, dark, score = self.size, self.dark, 0
        lines = [dark[y] for y in range(size)] + [[dark[y][x] for y in range(size)] for x in range(size)]
        for line in lines:
            run, previous = 0, None
            for value in line:
                run = run + 1 if value == previous else 1
                previous = value
                if run == 5:
                    score += 3
                elif run > 5:
                    score += 1
            text = "".join("1" if value else "0" for value in line)
            for pattern in ("10111010000", "00001011101"):
                start = text.find(pattern)
                while start != -1:
                    score += 40
                    start = text.find(pattern, start + 1)
        for y in range(size - 1):
            for x in range(size - 1):
                if dark[y][x] == dark[y][x + 1] == dark[y + 1][x] == dark[y + 1][x + 1]:
                    score += 3
        total = size * size
        count = sum(sum(row) for row in dark)
        score += (abs(count * 20 - total * 10) + total - 1) // total - 1 if count * 20 != total * 10 else 0
        return score * 1


def encode(text: str, *, mask: int | None = None, version: int | None = None, extra_zero_byte: bool = False) -> list[list[bool]]:
    payload = text.encode("utf-8")
    version = version or choose_version(len(payload))
    data = codewords(payload, version, extra_zero_byte=extra_zero_byte)
    best: tuple[int, list[list[bool]]] | None = None
    for candidate in ([mask] if mask is not None else range(8)):
        grid = Grid(version)
        grid.draw_function_patterns()
        grid.draw_codewords(data)
        grid.apply_mask(candidate)
        grid.draw_format(candidate)
        score = grid.penalty()
        if best is None or score < best[0]:
            best = (score, [row[:] for row in grid.dark])
    assert best is not None
    return best[1]


def to_svg(matrix: list[list[bool]], *, size_mm: int = 30, label: str = "QR code") -> str:
    border = 4
    total = len(matrix) + 2 * border
    path = "".join(f"M{x + border},{y + border}h1v1h-1z" for y, row in enumerate(matrix) for x, dark in enumerate(row) if dark)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" width="{size_mm}mm" height="{size_mm}mm" '
            f'role="img" aria-label="{label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>'
            f'<path d="{path}" fill="#000"/></svg>')
