"""Refill 奶豪 basic frames whose black hoodie/mask was keyed out as background (PLACEHOLDER fix).

Two passes, unioned:
1. morphological closing (radius r) + flood-fill holes;
2. a transparent pixel enclosed by opaque pixels on all four sides (within `reach` px).
New pixels get the hoodie colour; the original pixels stay on top.
"""
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HOODIE = (22, 22, 28)


def fill_holes(mask):
    w, h = mask.size
    inv = Image.eval(mask, lambda v: 0 if v else 255).convert("L")
    pad = Image.new("L", (w + 2, h + 2), 255)
    pad.paste(inv, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    outside = pad.crop((1, 1, w + 1, h + 1)).point(lambda v: 255 if v == 128 else 0)
    return Image.eval(outside, lambda v: 0 if v else 255)


def enclosed(mask, reach):
    w, h = mask.size
    px = mask.load()
    solid = [[px[x, y] > 0 for x in range(w)] for y in range(h)]
    left = [[0] * w for _ in range(h)]
    right = [[0] * w for _ in range(h)]
    up = [[0] * w for _ in range(h)]
    down = [[0] * w for _ in range(h)]
    big = 10 ** 6
    for y in range(h):
        d = big
        for x in range(w):
            d = 0 if solid[y][x] else d + 1
            left[y][x] = d
        d = big
        for x in range(w - 1, -1, -1):
            d = 0 if solid[y][x] else d + 1
            right[y][x] = d
    for x in range(w):
        d = big
        for y in range(h):
            d = 0 if solid[y][x] else d + 1
            up[y][x] = d
        d = big
        for y in range(h - 1, -1, -1):
            d = 0 if solid[y][x] else d + 1
            down[y][x] = d
    out = Image.new("L", (w, h), 0)
    op = out.load()
    for y in range(h):
        for x in range(w):
            if not solid[y][x] and left[y][x] <= reach and right[y][x] <= reach \
                    and up[y][x] <= reach and down[y][x] <= reach:
                op[x, y] = 255
    return out


def torso_rows(mask, max_run_frac=0.5):
    """Fill horizontal gaps inside the torso band (15%-60% of the body height)."""
    w, h = mask.size
    bb = mask.getbbox()
    px = mask.load()
    out = Image.new("L", (w, h), 0)
    op = out.load()
    y0 = bb[1] + int((bb[3] - bb[1]) * 0.15)
    y1 = bb[1] + int((bb[3] - bb[1]) * 0.60)
    for y in range(y0, y1):
        xs = [x for x in range(w) if px[x, y]]
        if len(xs) < 2:
            continue
        prev = xs[0]
        for x in xs[1:]:
            if 1 < x - prev <= w * max_run_frac:
                for xx in range(prev + 1, x):
                    op[xx, y] = 255
            prev = x
    return out


def repair(frame, r=16, reach=70):
    a = frame.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    closed = a.filter(ImageFilter.MaxFilter(2 * r + 1)).filter(ImageFilter.MinFilter(2 * r + 1))
    solid = fill_holes(ImageChops.lighter(closed, a))
    solid = ImageChops.lighter(solid, enclosed(ImageChops.lighter(solid, a), reach))
    solid = ImageChops.lighter(solid, torso_rows(ImageChops.lighter(solid, a)))
    solid = fill_holes(solid)
    new = ImageChops.subtract(solid, a)
    base = Image.new("RGBA", frame.size, HOODIE + (0,))
    base.putalpha(new)
    return Image.alpha_composite(base, frame)
