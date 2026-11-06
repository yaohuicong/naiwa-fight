"""Clean-up passes for generated frames: stray fragments from neighbouring cells, magenta key fringe."""
from collections import deque

from PIL import Image

FRINGE_RGB = (38, 30, 48)


def is_magenta(r, g, b):
    return r > 70 and b > 80 and g < 0.6 * min(r, b) and (r + b) / 2 - g > 40


def defringe(img: Image.Image, depth=2) -> Image.Image:
    """Darken magenta-ish pixels that sit within `depth` px of transparency (chroma-key residue)."""
    im = img.convert("RGBA").copy()
    w, h = im.size
    px = im.load()
    a = [[px[x, y][3] for x in range(w)] for y in range(h)]
    dist = [[0 if a[y][x] <= 8 else 99 for x in range(w)] for y in range(h)]
    for _ in range(depth):
        for y in range(h):
            for x in range(w):
                if dist[y][x] == 99:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and dist[ny][nx] < 99:
                            dist[y][x] = dist[ny][nx] + 1
                            break
    for y in range(h):
        for x in range(w):
            if dist[y][x] <= depth and a[y][x] > 8:
                r, g, b, al = px[x, y]
                if is_magenta(r, g, b):
                    px[x, y] = FRINGE_RGB + (al,)
    return im


def drop_edge_fragments(img: Image.Image, keep_ratio=0.4) -> Image.Image:
    """Remove alpha islands that touch the left/right canvas edge and are much smaller than the body."""
    im = img.convert("RGBA").copy()
    w, h = im.size
    px = im.load()
    solid = [[px[x, y][3] > 24 for x in range(w)] for y in range(h)]
    label = [[-1] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if solid[y][x] and label[y][x] < 0:
                cid = len(comps)
                q = deque([(x, y)])
                label[y][x] = cid
                pts = []
                edge = False
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    if cx <= 12 or cx >= w - 13:
                        edge = True
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < w and 0 <= ny < h and solid[ny][nx] and label[ny][nx] < 0:
                                label[ny][nx] = cid
                                q.append((nx, ny))
                comps.append((pts, edge))
    if not comps:
        return im
    biggest = max(len(p) for p, _ in comps)
    for pts, edge in comps:
        if edge and len(pts) < biggest * keep_ratio:
            for x, y in pts:
                px[x, y] = (0, 0, 0, 0)
    return im


def normalize_heights(frames):
    """Rescale each frame so its body height matches the median (fixes size pops inside a loop)."""
    boxes = [f.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox() for f in frames]
    hs = sorted(b[3] - b[1] for b in boxes)
    target = hs[len(hs) // 2]
    out = []
    for f, b in zip(frames, boxes):
        k = target / (b[3] - b[1])
        if abs(k - 1) < 0.02:
            out.append(f)
            continue
        body = f.crop(b)
        body = body.resize((max(1, round(body.width * k)), max(1, round(body.height * k))), Image.LANCZOS)
        c = Image.new("RGBA", f.size)
        cx = (b[0] + b[2]) / 2
        c.alpha_composite(body, (max(0, round(cx - body.width / 2)), max(0, b[3] - body.height)))
        out.append(c)
    return out
