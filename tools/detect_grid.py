"""Find sprite cells in a sheet by alpha projections: row bands, then column segments per band."""
import sys
from PIL import Image

def segments(profile, min_gap, min_len, thresh=0):
    segs, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v > thresh:
            if start is None:
                start = i
            gap = 0
            end = i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if end - start + 1 >= min_len:
                    segs.append((start, end))
                start, gap = None, 0
    if start is not None and end - start + 1 >= min_len:
        segs.append((start, end))
    return segs

def analyze(path):
    im = Image.open(path).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v > 24 else 0)
    w, h = im.size
    px = a.load()
    rows = [sum(1 for x in range(w) if px[x, y]) for y in range(h)]
    bands = segments(rows, min_gap=6, min_len=20, thresh=2)
    out = []
    for (y0, y1) in bands:
        cols = [sum(1 for y in range(y0, y1 + 1) if px[x, y]) for x in range(w)]
        segs = segments(cols, min_gap=4, min_len=12, thresh=1)
        out.append(((y0, y1), segs))
    return (w, h), out

for p in sys.argv[1:]:
    size, bands = analyze(p)
    print(f"## {p.split('/')[-1]} {size}  rows={len(bands)} cols={[len(s) for _, s in bands]}")
    for (y0, y1), segs in bands:
        print(f"   y {y0}-{y1}: " + " ".join(f"{a}-{b}" for a, b in segs))
