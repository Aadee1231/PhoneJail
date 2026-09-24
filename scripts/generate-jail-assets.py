import array
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import wave
import zlib


ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "assets" / "models"
W, D, H = 0.23, 0.14, 0.11
TAU = 2 * math.pi


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(a):
    return mul(a, 1 / math.sqrt(dot(a, a)))


class Mesh:
    def __init__(self, name):
        self.name = name
        self.positions = []
        self.uvs = []
        self.normals = []
        self.lookups = [{}, {}, {}]
        self.faces = []
        self.group = name

    def index(self, values, slot):
        values = tuple(round(v, 9) for v in values)
        data = (self.positions, self.uvs, self.normals)[slot]
        if values not in self.lookups[slot]:
            self.lookups[slot][values] = len(data) + 1
            data.append(values)
        return self.lookups[slot][values]

    def triangle(self, points, uvs=None, normals=None):
        normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        if dot(normal, normal) < 1e-24:
            raise ValueError(f"Degenerate triangle in {self.name}/{self.group}")
        if normals is None:
            normals = [unit(normal)] * 3
        if uvs is None:
            uvs = [(p[0] / W + 0.5, p[1] / H) for p in points]
        indices = tuple((self.index(p, 0), self.index(uv, 1), self.index(n, 2)) for p, uv, n in zip(points, uvs, normals))
        self.faces.append((self.group, indices))

    def quad(self, points, uvs=None, normals=None):
        if uvs is None:
            uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for indices in [(0, 1, 2), (0, 2, 3)]:
            self.triangle([points[i] for i in indices], [uvs[i] for i in indices], [normals[i] for i in indices] if normals else None)

    def save(self):
        lines = [f"o {self.name}"]
        for prefix, values in [("v", self.positions), ("vt", self.uvs), ("vn", self.normals)]:
            lines.extend(prefix + " " + " ".join(f"{v:.9f}" for v in row) for row in values)
        current = None
        for group, face in self.faces:
            if group != current:
                lines.append(f"g {group}")
                current = group
            lines.append("f " + " ".join("/".join(str(i) for i in vertex) for vertex in face))
        path = MODELS / f"{self.name}.obj"
        path.write_text("\n".join(lines) + "\n", encoding="ascii")
        return validate_obj(path)


def rounded_rectangle(hx, hy, radius, segments=12, center=(0, 0)):
    points = []
    for x, y, start in [(hx - radius, hy - radius, 0), (-hx + radius, hy - radius, 90), (-hx + radius, -hy + radius, 180), (hx - radius, -hy + radius, 270)]:
        for i in range(segments + 1):
            angle = math.radians(start + 90 * i / segments)
            points.append((center[0] + x + radius * math.cos(angle), center[1] + y + radius * math.sin(angle)))
    return points


def sweep(mesh, path, radius, sides=8, closed=False, smooth=False):
    rings, normals = [], []
    reference = (0, 1, 0) if max(p[1] for p in path) - min(p[1] for p in path) < 1e-10 else (0, 0, 1)
    for i, point in enumerate(path):
        prev = path[(i - 1) % len(path)] if closed or i else point
        nxt = path[(i + 1) % len(path)] if closed or i < len(path) - 1 else point
        tangent = unit(sub(nxt, prev))
        axis1 = unit(cross(tangent, reference))
        axis2 = unit(cross(tangent, axis1))
        ring_normals = [add(mul(axis1, math.cos(TAU * j / sides)), mul(axis2, math.sin(TAU * j / sides))) for j in range(sides)]
        rings.append([add(point, mul(n, radius)) for n in ring_normals])
        normals.append(ring_normals)
    for i in range(len(path) if closed else len(path) - 1):
        k = (i + 1) % len(path)
        for j in range(sides):
            q = (j + 1) % sides
            mesh.quad([rings[i][j], rings[i][q], rings[k][q], rings[k][j]], [(j / sides, i / len(path)), ((j + 1) / sides, i / len(path)), ((j + 1) / sides, (i + 1) / len(path)), (j / sides, (i + 1) / len(path))], [normals[i][j], normals[i][q], normals[k][q], normals[k][j]] if smooth else None)
    if not closed:
        for i, reverse in [(0, True), (len(path) - 1, False)]:
            for j in range(sides):
                a, b = rings[i][j], rings[i][(j + 1) % sides]
                mesh.triangle([path[i], b, a] if reverse else [path[i], a, b])


def horizontal_rim(mesh, hx, hz, y, radius, corner):
    path = [(x, y, z) for x, z in rounded_rectangle(hx - radius, hz - radius, corner)]
    rings = []
    for i, point in enumerate(path):
        tangent = unit(sub(path[(i + 1) % len(path)], path[(i - 1) % len(path)]))
        outward = (tangent[2], 0, -tangent[0])
        rings.append([add(point, add(mul(outward, radius * math.cos(TAU * j / 8)), (0, radius * math.sin(TAU * j / 8), 0))) for j in range(8)])
    for i in range(len(path)):
        k = (i + 1) % len(path)
        for j in range(8):
            q = (j + 1) % 8
            mesh.quad([rings[i][j], rings[i][q], rings[k][q], rings[k][j]])


def strip(mesh, start, end, width, axis):
    offset = mul(axis, width / 2)
    mesh.quad([sub(start, offset), sub(end, offset), add(end, offset), add(start, offset)], [(0, 0), (0, 1), (1, 1), (1, 0)])


def make_panels():
    mesh = Mesh("phone-jail-panels")
    x, z, lo, hi = W / 2 - 0.0009, D / 2 - 0.0009, 0.0009, H - 0.0009
    panels = {
        "front": [(-x, lo, z), (x, lo, z), (x, hi, z), (-x, hi, z)],
        "back": [(x, lo, -z), (-x, lo, -z), (-x, hi, -z), (x, hi, -z)],
        "right": [(x, lo, z), (x, lo, -z), (x, hi, -z), (x, hi, z)],
        "left": [(-x, lo, -z), (-x, lo, z), (-x, hi, z), (-x, hi, -z)],
        "ceiling": [(-x, hi, z), (x, hi, z), (x, hi, -z), (-x, hi, -z)],
        "floor": [(-x, lo, -z), (x, lo, -z), (x, lo, z), (-x, lo, z)],
    }
    for name, points in panels.items():
        mesh.group = name
        mesh.quad(points)
    return mesh


def make_frame():
    mesh = Mesh("phone-jail-frame")
    radius = 0.00085
    for y, name in [(radius, "lower_chamfered_rim"), (H - radius, "upper_chamfered_rim")]:
        mesh.group = name
        horizontal_rim(mesh, W / 2, D / 2, y, radius, 0.0034)
    mesh.group = "corner_columns"
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            x, z = sx * (W / 2 - 0.00185), sz * (D / 2 - 0.00185)
            sweep(mesh, [(x, radius, z), (x, H - radius, z)], 0.0008)
    mesh.group = "inset_precision_trim"
    for y in [0.0028, H - 0.0028]:
        horizontal_rim(mesh, W / 2 - 0.0034, D / 2 - 0.0034, y, 0.0003, 0.004)
    mesh.group = "corner_joinery"
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            for y in [0.0045, H - 0.0045]:
                sweep(mesh, [(sx * 0.105, y, sz * 0.0681), (sx * 0.110, y, sz * 0.0681), (sx * 0.1131, y, sz * 0.065), (sx * 0.1131, y, sz * 0.060)], 0.00065)
    return mesh


def make_guides():
    mesh = Mesh("phone-jail-guides")
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            mesh.group = f"alignment_corner_{sx}_{sz}"
            path = [(sx * 0.103, 0.001, sz * 0.077), (sx * 0.119, 0.001, sz * 0.077), (sx * 0.122, 0.001, sz * 0.074), (sx * 0.122, 0.001, sz * 0.058)]
            sweep(mesh, path, 0.0007)
    return mesh


def make_grid():
    mesh = Mesh("phone-jail-grid")
    mesh.group = "fine_floor_grid"
    for i in range(-10, 11):
        x = i * 0.01
        strip(mesh, (x, 0.00135, -0.06), (x, 0.00135, 0.06), 0.00028, (1, 0, 0))
    for i in range(-6, 7):
        z = i * 0.01
        strip(mesh, (-0.10, 0.00137, z), (0.10, 0.00137, z), 0.00028, (0, 0, 1))
    mesh.group = "inner_alignment_border"
    horizontal_rim(mesh, 0.105, 0.065, 0.0014, 0.0003, 0.005)
    mesh.group = "alignment_ticks"
    for sx in [-1, 1]:
        for z in [-0.045, -0.015, 0.015, 0.045]:
            strip(mesh, (sx * 0.101, 0.0018, z), (sx * 0.108, 0.0018, z), 0.00065, (0, 0, 1))
    return mesh


def ray_polygon(origin, direction, polygon):
    distances = []
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        edge = (b[0] - a[0], b[1] - a[1])
        offset = (a[0] - origin[0], a[1] - origin[1])
        denom = direction[0] * edge[1] - direction[1] * edge[0]
        if abs(denom) < 1e-14:
            continue
        t = (offset[0] * edge[1] - offset[1] * edge[0]) / denom
        u = (offset[0] * direction[1] - offset[1] * direction[0]) / denom
        if t > 0 and -1e-8 <= u <= 1 + 1e-8:
            distances.append(t)
    if not distances:
        raise ValueError("Open radial polygon")
    return min(distances)


def make_lock():
    mesh = Mesh("phone-jail-lock")
    center = (0, -0.0115)
    outer = rounded_rectangle(0.0225, 0.0175, 0.005, 20, (0, -0.0125))
    inset = rounded_rectangle(0.02175, 0.01675, 0.00425, 20, (0, -0.0125))
    hole = []
    for i in range(81):
        a = math.radians(-50 + 280 * i / 80)
        hole.append((0.0034 * math.cos(a), center[1] + 0.0034 * math.sin(a)))
    hole.extend([(-0.00155, -0.0162), (-0.0023, -0.022), (0.0023, -0.022), (0.00155, -0.0162)])
    angles = sorted(set([round((math.atan2(p[1] - center[1], p[0] - center[0]) % TAU), 12) for p in outer + inset + hole] + [round(TAU * i / 192, 12) for i in range(192)]))
    rings = [[] for _ in range(8)]
    for angle in angles:
        direction = (math.cos(angle), math.sin(angle))
        ro = ray_polygon(center, direction, outer)
        ri = ray_polygon(center, direction, inset)
        rh = ray_polygon(center, direction, hole)
        for ring, (r, z) in zip(rings, [(ro, -0.00175), (ri, -0.0025), (rh + 0.00035, -0.0025), (rh, -0.00175), (rh, 0.00175), (rh + 0.00035, 0.0025), (ri, 0.0025), (ro, 0.00175)]):
            ring.append((center[0] + r * direction[0], center[1] + r * direction[1], z))
    names = ["rear_outer_bevel", "rear_annulus", "rear_keyhole_bevel", "open_keyhole_wall", "front_keyhole_bevel", "front_annulus", "front_outer_bevel", "rounded_body_wall"]
    for k in range(8):
        mesh.group = names[k]
        next_ring = rings[(k + 1) % 8]
        for i in range(len(angles)):
            j = (i + 1) % len(angles)
            points = [rings[k][i], next_ring[i], next_ring[j], rings[k][j]]
            mesh.quad(points, [(p[0] / 0.045 + 0.5, (p[1] + 0.03) / 0.06) for p in points])
    mesh.group = "rounded_u_shackle"
    path = [(-0.0142, 0.002, 0), (-0.0142, 0.013, 0)]
    for i in range(1, 49):
        angle = math.pi * (1 - i / 48)
        path.append((0.0142 * math.cos(angle), 0.013 + 0.0142 * math.sin(angle), 0))
    path.append((0.0142, 0.002, 0))
    sweep(mesh, path, 0.0028, sides=16, smooth=True)
    return mesh


def make_halo():
    mesh = Mesh("phone-jail-halo")
    mesh.quad([(-0.145, 0.0002, 0.10), (0.145, 0.0002, 0.10), (0.145, 0.0002, -0.10), (-0.145, 0.0002, -0.10)])
    return mesh


def make_edge_glow():
    mesh = Mesh("phone-jail-edge-glow")
    for y in [0.00085, H - 0.00085]:
        for sz in [-1, 1]:
            z = sz * 0.06915
            strip(mesh, (-0.110, y, z), (0.110, y, z), 0.0038, (0, 0, 1))
            strip(mesh, (-0.110, max(0.0019, min(H - 0.0019, y)), z), (0.110, max(0.0019, min(H - 0.0019, y)), z), 0.0038, (0, 1, 0))
        for sx in [-1, 1]:
            x = sx * 0.11415
            strip(mesh, (x, y, -0.065), (x, y, 0.065), 0.0038, (1, 0, 0))
            strip(mesh, (x, max(0.0019, min(H - 0.0019, y)), -0.065), (x, max(0.0019, min(H - 0.0019, y)), 0.065), 0.0038, (0, 1, 0))
    for sx in [-1, 1]:
        for sz in [-1, 1]:
            x, z = sx * 0.11315, sz * 0.06815
            for axis in [(1, 0, 0), (0, 0, 1)]:
                strip(mesh, (x, 0.002, z), (x, H - 0.002, z), 0.0038, axis)
    return mesh


def write_rgba_png(path, width, height, rows):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b""))
    decoded = path.read_bytes()
    offset, compressed = 8, bytearray()
    while offset < len(decoded):
        size = struct.unpack(">I", decoded[offset:offset + 4])[0]
        kind = decoded[offset + 4:offset + 8]
        data = decoded[offset + 8:offset + 8 + size]
        crc = struct.unpack(">I", decoded[offset + 8 + size:offset + 12 + size])[0]
        assert zlib.crc32(kind + data) & 0xffffffff == crc
        if kind == b"IDAT":
            compressed.extend(data)
        offset += size + 12
    assert zlib.decompress(compressed) == bytes(rows)


def png(path, width, height, pixel):
    rows = bytearray()
    alpha_values = []
    for y in range(height):
        rows.append(0)
        for x in range(width):
            alpha = max(0, min(255, round(pixel(x, y) * 255)))
            rows.extend((255, 255, 255, alpha))
            alpha_values.append(alpha)
    write_rgba_png(path, width, height, rows)
    assert min(alpha_values) == 0 and max(alpha_values) > 0
    return {"width": width, "height": height, "rgb": "white; tint in material", "alpha_min": min(alpha_values), "alpha_max": max(alpha_values), "center_alpha": alpha_values[(height // 2) * width + width // 2]}


def make_textures():
    def halo(x, y):
        px = abs((x + 0.5) / 512 * 0.29 - 0.145)
        pz = abs((y + 0.5) / 384 * 0.20 - 0.10)
        qx, qz = px - (0.115 - 0.006), pz - (0.070 - 0.006)
        distance = math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - 0.006
        return 0.72 * math.exp(-0.5 * (distance / 0.0037) ** 2)
    def grid(x, y):
        dx, dy = min(x, 255 - x), min(y, 255 - y)
        return 0.66 * math.exp(-0.5 * (min(dx, dy) / 1.25) ** 2)
    def edge(x, y):
        u = abs((x + 0.5) / 128 - 0.5) * 2
        return max(0, math.exp(-5 * u * u) - math.exp(-5))
    result = {
        "halo.png": png(MODELS / "halo.png", 512, 384, halo),
        "grid.png": png(MODELS / "grid.png", 256, 256, grid),
        "edge-glow.png": png(MODELS / "edge-glow.png", 128, 16, edge),
    }
    assert result["halo.png"]["center_alpha"] == 0
    assert result["grid.png"]["center_alpha"] == 0
    return result


def make_alarm():
    rate, seconds = 44100, 2
    samples = []
    phase = 0
    for i in range(rate * seconds):
        t = i / rate
        sweep_frequency = 620 + 280 * (0.5 - 0.5 * math.cos(TAU * t))
        phase += TAU * sweep_frequency / rate
        tone = math.sin(phase) + 0.31 * math.sin(2 * phase + 0.18) + 0.18 * math.sin(3 * phase + 0.4) + 0.075 * math.sin(5 * phase)
        undertone = 0.19 * math.sin(TAU * 190 * t) + 0.085 * math.sin(TAU * 380 * t + 0.3)
        pulse = 0.87 + 0.13 * math.cos(TAU * 8 * t)
        fade = min(1, i / (0.025 * rate), (rate * seconds - 1 - i) / (0.025 * rate))
        envelope = math.sin(max(0, fade) * math.pi / 2) ** 2
        samples.append(math.tanh(1.8 * (tone * pulse + undertone)) * envelope)
    peak = max(abs(v) for v in samples)
    gain = (10 ** (-1 / 20)) * 32767 / peak
    pcm = array.array("h", (round(v * gain) for v in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    path = ROOT / "assets" / "sounds" / "containment-alarm.wav"
    with wave.open(str(path), "wb") as sound:
        sound.setnchannels(1)
        sound.setsampwidth(2)
        sound.setframerate(rate)
        sound.writeframes(pcm.tobytes())
    with wave.open(str(path), "rb") as sound:
        assert sound.getparams()[:4] == (1, 2, rate, rate * seconds)
        decoded = array.array("h", sound.readframes(sound.getnframes()))
        if sys.byteorder != "little":
            decoded.byteswap()
    peak = max(abs(v) for v in decoded) / 32767
    rms = math.sqrt(sum((v / 32767) ** 2 for v in decoded) / len(decoded))
    assert decoded[0] == decoded[-1] == 0
    assert max(abs(v) for v in decoded) < 32767
    assert abs(20 * math.log10(peak) + 1) < 0.001
    return {"file": str(path.relative_to(ROOT)), "sample_rate": rate, "channels": 1, "bits_per_sample": 16, "seconds": seconds, "peak_dbfs": round(20 * math.log10(peak), 5), "rms_dbfs": round(20 * math.log10(rms), 5), "endpoint_samples": [decoded[0], decoded[-1]], "fade_ms": 25, "sweep_hz": [620, 900], "sweep_cycles": 2, "clipped_samples": sum(abs(v) >= 32767 for v in decoded)}


def validate_obj(path):
    positions, uvs, normals, faces, groups = [], [], [], [], {}
    group = None
    for line in path.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if parts[0] == "v":
            positions.append(tuple(float(v) for v in parts[1:]))
        elif parts[0] == "vt":
            uvs.append(tuple(float(v) for v in parts[1:]))
        elif parts[0] == "vn":
            normals.append(tuple(float(v) for v in parts[1:]))
        elif parts[0] == "g":
            group = parts[1]
        elif parts[0] == "f":
            assert len(parts) == 4
            face = [tuple(int(v) for v in p.split("/")) for p in parts[1:]]
            for vertex in face:
                assert len(vertex) == 3
                assert all(1 <= i <= n for i, n in zip(vertex, (len(positions), len(uvs), len(normals))))
            faces.append(face)
            groups[group] = groups.get(group, 0) + 1
    assert positions and faces and normals and uvs
    assert all(math.isfinite(v) for rows in [positions, uvs, normals] for row in rows for v in row)
    assert all(abs(dot(n, n) - 1) < 1e-6 for n in normals)
    for face in faces:
        p = [positions[v[0] - 1] for v in face]
        geometric = cross(sub(p[1], p[0]), sub(p[2], p[0]))
        assert dot(geometric, geometric) > 1e-24
        assert all(dot(geometric, normals[v[2] - 1]) > 0 for v in face)
    lo = [min(p[i] for p in positions) for i in range(3)]
    hi = [max(p[i] for p in positions) for i in range(3)]
    if path.stem != "phone-jail-lock":
        assert lo[1] >= -1e-9
    if path.stem == "phone-jail-frame":
        assert all(abs(a - b) < 1e-6 for a, b in zip(lo + hi, [-W / 2, 0, -D / 2, W / 2, H, D / 2]))
    if path.stem == "phone-jail-panels":
        assert len(groups) == 6 and len(faces) == 12
    if path.stem in ["phone-jail-frame", "phone-jail-guides", "phone-jail-lock"]:
        edge_uses = {}
        signed_volume = 0
        for face in faces:
            indices = [v[0] for v in face]
            p = [positions[i - 1] for i in indices]
            signed_volume += dot(p[0], cross(p[1], p[2])) / 6
            for a, b in zip(indices, indices[1:] + indices[:1]):
                key = (min(a, b), max(a, b))
                edge_uses.setdefault(key, []).append(1 if a < b else -1)
        assert all(len(uses) == 2 and sum(uses) == 0 for uses in edge_uses.values()), "Solid mesh must have closed consistently oriented edges"
        assert signed_volume > 0, "Solid normals must face outward"
    if path.stem == "phone-jail-lock":
        assert abs((hi[0] - lo[0]) - 0.045) < 1e-6
        assert abs((hi[1] - lo[1]) - 0.060) < 1e-6
        for x, y in [(0, -0.0115), (0, -0.020)]:
            for face in faces:
                p = [positions[v[0] - 1] for v in face]
                if max(v[2] for v in p) - min(v[2] for v in p) > 1e-9:
                    continue
                signs = [(p[(i + 1) % 3][0] - p[i][0]) * (y - p[i][1]) - (p[(i + 1) % 3][1] - p[i][1]) * (x - p[i][0]) for i in range(3)]
                assert not (all(s >= -1e-14 for s in signs) or all(s <= 1e-14 for s in signs)), "Keyhole must remain open"
    return {"vertices": len(positions), "uvs": len(uvs), "normals": len(normals), "triangles": len(faces), "bounds_min_m": lo, "bounds_max_m": hi, "dimensions_m": [round(b - a, 9) for a, b in zip(lo, hi)], "groups": groups, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def make_preview(meshes):
    width, height = 2048, 1280
    pixels = bytearray(width * height * 3)
    for y in range(height):
        for x in range(width):
            grain = ((x * 19 + y * 7 + (x * y) % 23) % 13) / 13
            value = 14 + 8 * y / height + grain * 1.8
            index = (y * width + x) * 3
            pixels[index:index + 3] = bytes((int(value), int(value + 5), int(value + 10)))
    eye = unit((0.60, 0.49, 0.75))
    right = unit(cross((0, 1, 0), eye))
    up = unit(cross(eye, right))
    light = unit((-0.3, 0.8, 0.7))
    triangles = []
    styles = {
        "phone-jail-panels": ((103, 192, 255), 0.055, None),
        "phone-jail-frame": ((169, 228, 255), 0.95, None),
        "phone-jail-guides": ((109, 214, 255), 0.8, None),
        "phone-jail-grid": ((104, 202, 255), 0.30, None),
        "phone-jail-lock": ((255, 255, 255), 1, None),
        "phone-jail-halo": ((55, 166, 255), 0.34, "halo"),
        "phone-jail-edge-glow": ((65, 177, 255), 0.28, "edge"),
    }
    for mesh in meshes:
        color, opacity, texture = styles[mesh.name]
        for group, face in mesh.faces:
            points = [mesh.positions[v[0] - 1] for v in face]
            normals = [mesh.normals[v[2] - 1] for v in face]
            uvs = [mesh.uvs[v[1] - 1] for v in face]
            if mesh.name == "phone-jail-lock":
                points = [add(p, (0, 0.056, 0.045)) for p in points]
            projected = [(760 + dot(p, right) * 4700, 920 - dot(p, up) * 4700) for p in points]
            shade = 1
            if mesh.name == "phone-jail-lock":
                shade = 0.70 + 0.30 * max(0, dot(unit(add(add(normals[0], normals[1]), normals[2])), light))
            triangles.append((sum(dot(p, eye) for p in points) / 3, projected, uvs, tuple(v * shade for v in color), opacity, texture))
    lock = next(mesh for mesh in meshes if mesh.name == "phone-jail-lock")
    for group, face in lock.faces:
        points = [lock.positions[v[0] - 1] for v in face]
        normal = unit(tuple(sum(lock.normals[v[2] - 1][i] for v in face) for i in range(3)))
        shade = 0.7 + 0.3 * max(0, dot(normal, light))
        projected = [(1750 + p[0] * 9000, 665 - p[1] * 9000) for p in points]
        triangles.append((sum(p[2] for p in points) / 3, projected, [(0, 0)] * 3, (255 * shade,) * 3, 1, None))
    for depth, points, uvs, color, opacity, texture in sorted(triangles, key=lambda t: t[0]):
        (ax, ay), (bx, by), (cx, cy) = points
        denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denominator) < 1e-9:
            continue
        x0, x1 = max(0, math.floor(min(p[0] for p in points))), min(width - 1, math.ceil(max(p[0] for p in points)))
        y0, y1 = max(0, math.floor(min(p[1] for p in points))), min(height - 1, math.ceil(max(p[1] for p in points)))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                a = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / denominator
                b = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / denominator
                c = 1 - a - b
                if min(a, b, c) < 0:
                    continue
                alpha = opacity
                if texture:
                    u = a * uvs[0][0] + b * uvs[1][0] + c * uvs[2][0]
                    v = a * uvs[0][1] + b * uvs[1][1] + c * uvs[2][1]
                    if texture == "halo":
                        qx, qz = abs(u * 0.29 - 0.145) - 0.109, abs(v * 0.20 - 0.10) - 0.064
                        distance = math.hypot(max(qx, 0), max(qz, 0)) + min(max(qx, qz), 0) - 0.006
                        alpha *= 0.72 * math.exp(-0.5 * (distance / 0.0037) ** 2)
                    else:
                        alpha *= max(0, math.exp(-5 * (2 * u - 1) ** 2) - math.exp(-5))
                if alpha < 0.002:
                    continue
                index = (y * width + x) * 3
                for channel in range(3):
                    pixels[index + channel] = min(255, round(pixels[index + channel] * (1 if texture else 1 - alpha) + color[channel] * alpha))
    rows = bytearray()
    for y in range(0, height, 2):
        rows.append(0)
        for x in range(0, width, 2):
            for channel in range(3):
                rows.append(round(sum(pixels[((y + dy) * width + x + dx) * 3 + channel] for dx, dy in [(0, 0), (1, 0), (0, 1), (1, 1)]) / 4))
            rows.append(255)
    write_rgba_png(MODELS / "asset-preview.png", width // 2, height // 2, rows)
    print("asset-preview.png: offline CPU triangle rasterization, not a Viro screenshot")


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    meshes = [make_panels(), make_frame(), make_guides(), make_grid(), make_lock(), make_halo(), make_edge_glow()]
    models = {f"{mesh.name}.obj": mesh.save() for mesh in meshes}
    textures = make_textures()
    alarm = make_alarm()
    if "--preview" in sys.argv:
        make_preview(meshes)
    manifest = {
        "generator": "python3 scripts/generate-jail-assets.py",
        "units": "meters",
        "axes": {"up": "+y", "front": "+z", "origin": "chamber bottom center; lock independently centered"},
        "chamber_dimensions_m": [W, H, D],
        "lock_parent_position_m": [0, 0.056, 0.045],
        "obj_contract": "ASCII triangles; separate indexed v/vt/vn; no MTL dependency; apply one explicit material to each OBJ",
        "materials": {
            "phone-jail-panels.obj": {"suggested_name": "jailPanels", "diffuse": "rgba(112,195,255,0.06)", "blend": "Alpha", "lighting": "Constant", "cull": "None", "depth_write": False},
            "phone-jail-frame.obj": {"suggested_name": "jailFrame", "diffuse": "rgba(165,228,255,0.88)", "blend": "Alpha", "lighting": "Constant", "cull": "None", "depth_write": False},
            "phone-jail-guides.obj": {"suggested_name": "jailGuides", "diffuse": "rgba(112,218,255,0.65)", "blend": "Add", "lighting": "Constant", "cull": "None", "depth_write": False},
            "phone-jail-grid.obj": {"suggested_name": "jailGrid", "diffuse": "rgba(116,213,255,0.25)", "blend": "Alpha", "lighting": "Constant", "cull": "None", "depth_write": False},
            "phone-jail-lock.obj": {"suggested_name": "jailLock", "diffuse": "#FFFFFF", "blend": "Alpha", "lighting": "Constant or Blinn with scene lights for bevel highlights", "cull": "None", "depth_write": True},
            "phone-jail-halo.obj": {"suggested_name": "jailHalo", "texture": "halo.png", "diffuse": "rgba(67,175,255,0.35)", "blend": "Add", "lighting": "Constant", "cull": "None", "depth_write": False},
            "phone-jail-edge-glow.obj": {"suggested_name": "jailEdgeGlow", "texture": "edge-glow.png", "diffuse": "rgba(60,163,255,0.20)", "blend": "Add", "lighting": "Constant", "cull": "None", "depth_write": False}
        },
        "grid_texture_usage": "Optional plane overlay: grid.png is one seamless 10mm tile, white RGB with alpha; tint blue-cyan and repeat U/V at plane dimensions / 0.01. Prefer floor mesh or texture, not both at full opacity.",
        "rendering_status": "Geometry and files validated offline; actual Viro rendering requires device verification.",
        "models": models,
        "textures": textures,
        "alarm": alarm,
    }
    (MODELS / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    for name, result in models.items():
        print(f"{name}: {result['vertices']} vertices, {result['triangles']} triangles, bounds {result['bounds_min_m']} .. {result['bounds_max_m']}")
    print(json.dumps({"textures": textures, "alarm": alarm}, indent=2))
    print("All OBJ indices, finite unit normals, triangle area/winding, chamber bounds, open keyhole, texture alpha, and PCM tests passed.")


if __name__ == "__main__":
    main()
