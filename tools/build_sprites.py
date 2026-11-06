"""Build game-ready sprite strips from the Drive「奶娃」assets.

- Sheet PNGs (奶察 / 豆奶 / 精锐): frames are not registered to a grid, so each frame is
  cut out by alpha, then re-registered on its feet (bottom of the bbox, x = centroid of
  the lowest rows).
- Boss zips (奶豪): frames already share a canvas per action, so one anchor is used for
  the whole action (keeps the in-place motion). FX frames reuse the same crop.

Output: public/assets/sprites/<key>.png (horizontal strip) + manifest.json
        tools/out/review_<group>.png (contact sheets for checking)
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from repair_hoodie import repair  # noqa: E402
from cleanup import defringe, drop_edge_fragments, normalize_heights  # noqa: E402

# v1 奶豪 basic frames had the hoodie keyed out; v2 (2026-11-05) re-exports are solid -> no repair needed
HOODIE_REPAIR = set()

ROOT = sys.argv[1]
SRC = os.path.join(ROOT, "drive-assets")
UNZ = os.path.join(ROOT, "drive-unzipped")
OUT = os.path.join(ROOT, "public", "assets", "sprites")
REVIEW = os.path.join(ROOT, "tools", "out")
os.makedirs(OUT, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

ALPHA_T = 24

# key, drive file, frame count, rows
SHEETS = [
    ("nc_idle", "奶察-待机-6帧表.png", 6, 1),
    ("nc_walk", "奶察-走路-8帧表.png", 8, 2),
    ("nc_run", "奶察-跑步-8帧表.png", 8, 2),
    ("nc_light", "奶察-轻击-8帧表.png", 8, 2),
    ("nc_heavy", "奶察-重击-12帧表.png", 12, 3),
    ("nc_special", "奶察-奶狗骑乘冲锋-12帧表.png", 12, 3),
    ("nc_hurt", "奶察-受击-4帧表.png", 4, 1),
    ("nc_down", "奶察-倒地-6帧表.png", 6, 1),
    ("nc_getup", "奶察-起身-5帧表.png", 5, 1),
    ("nc_win", "奶察-胜利-6帧表.png", 6, 1),
    ("nc_laugh", "奶察-狂笑-8帧表.png", 8, 2),
    ("dn_idle", "豆奶-待机-4帧表.png", 4, 1),
    ("dn_throw", "豆奶-投掷-8帧表.png", 8, 2),
    ("dn_hurt", "豆奶-受击-3帧表.png", 3, 1),
    ("dn_death", "豆奶-死亡-7帧表.png", 7, 1),
    ("dn_mic", "豆奶-麦克风投射物-4帧表.png", 4, 1),
]

# 2026-11-06「审查重做」batch: fixed-grid sheets, every cell has ≥32px transparent margin → cut on the grid.
V3 = os.path.join(ROOT, "drive-assets", "v3")
V3_SHEETS = {
    "nh_ko": ("p0/奶豪-KO-8帧表-v3.png", 420, 440),
    "nh_getup": ("p0/奶豪-起身-5帧表-v3.png", 420, 440),
    "nh_attack": ("p0/奶豪-普攻-8帧表-v2.png", 420, 440),
    "nh_charge": ("p1/奶豪-肚皮冲撞-8帧表.png", 420, 440),
    "nc_jattack": ("p1/奶察-跳跃攻击-4帧表.png", 360, 400),
    "nc_dodge": ("p1/奶察-闪避翻滚-6帧表.png", 360, 400),
    "ml_idle": ("p1/精锐近战-待机-6帧表-v2.png", 360, 400),
    "ml_walk": ("p1/精锐近战-走路-8帧表-v2.png", 360, 400),
    "ml_attack": ("p1/精锐近战-攻击-8帧表-v2.png", 360, 400),
    "ml_hurt": ("p1/精锐近战-受击-4帧表-v2.png", 360, 400),
    "ml_death": ("p1/精锐近战-死亡-6帧表-v2.png", 360, 400),
    "nh_dance": ("p2/奶豪-雨中独舞-24帧表-v2.png", 420, 440),
    "nh_type": ("p2/奶豪-终端装逼-打字-16帧表-v2.png", 420, 440),
    "nh_hack": ("p2/奶豪-终端装逼-黑客屏-12帧表-v2.png", 420, 440),
    "nh_hole": ("p2/奶豪-终端装逼-黑洞吸附-12帧表-v2.png", 420, 440),
}


def explode_v3(key):
    """Cut a v3 sheet on its grid into drive-unzipped/v3/<key>/frame_NN.png (skips empty cells)."""
    rel, cw, ch = V3_SHEETS[key]
    im = Image.open(os.path.join(V3, rel)).convert("RGBA")
    d = os.path.join(UNZ, "v3", key)
    os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        os.remove(os.path.join(d, old))
    n = 0
    for r in range(im.height // ch):
        for c in range(im.width // cw):
            cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            if cell.getchannel("A").getbbox() is None:
                continue
            n += 1
            cell.save(os.path.join(d, f"frame_{n:02d}.png"))
    return "v3/" + key

# key, unzipped folder, has fx frames[, "fxonly"]
ZIPS = [
    ("nh_idle", "v2/奶豪-待机-6单帧-v2", False),
    ("nh_walk", "v2/奶豪-走路-8单帧-v2", False),
    ("nh_run", "v2/奶豪-跑步-8单帧-v2", False),
    ("nh_hurt", "v2/奶豪-受击-4单帧-v2", False),
    ("nh_down", "v2/奶豪-倒地-6单帧-v2", False),
    ("nh_win", "v2/奶豪-胜利-6单帧-v2", False),
    ("nc_jump", "v2/奶察-跳跃-6单帧", False),
    ("nc_ko", "v2/奶察-KO-8单帧", False),
    ("dn_walk", "v2/豆奶-走路-8单帧", False),
    # 黑客屏 / 黑洞的独立特效层仍用第一批的 FX 单帧（新帧表只重画了奶豪本人）
    ("nh_hack", "奶豪-终端装逼-黑客屏-12单帧+FX", True, "fxonly"),
    ("nh_hole", "奶豪-终端装逼-黑洞吸附-12单帧+FX", True, "fxonly"),
] + [(k, explode_v3(k), False) for k in V3_SHEETS]

# Actions whose reference frame is not upright: borrow the body height of an upright action from the same batch.
REF_LIKE = {"nh_ko": "nh_getup"}


def alpha_mask(im):
    return im.getchannel("A").point(lambda v: 255 if v > ALPHA_T else 0)


def segments(profile, min_gap, min_len, thresh):
    segs, start, gap, end = [], None, 0, 0
    for i, v in enumerate(profile):
        if v > thresh:
            if start is None:
                start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if end - start + 1 >= min_len:
                    segs.append([start, end])
                start, gap = None, 0
    if start is not None and end - start + 1 >= min_len:
        segs.append([start, end])
    return segs


def fit_count(segs, want, cols_profile):
    """Merge split frames / split touching frames until there are `want` segments."""
    segs = [list(s) for s in segs]
    while len(segs) > want:  # merge the pair with the smallest gap
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = gaps.index(min(gaps))
        segs[i] = [segs[i][0], segs[i + 1][1]]
        del segs[i + 1]
    while len(segs) < want:  # split the widest at its emptiest column near the middle
        widths = [s[1] - s[0] for s in segs]
        i = widths.index(max(widths))
        a, b = segs[i]
        # how many frames does this blob hold? split off one frame's width from the left
        approx = round((b - a) / (sum(widths) / want))
        approx = max(2, approx)
        target = a + (b - a) / approx
        lo, hi = int(target - (b - a) / approx * 0.35), int(target + (b - a) / approx * 0.35)
        cut = min(range(lo, hi), key=lambda x: (cols_profile[x], abs(x - target)))
        segs[i:i + 1] = [[a, cut], [cut + 1, b]]
    return segs


def feet_anchor(mask_crop):
    """(x, y) of the feet inside a cropped frame mask."""
    w, h = mask_crop.size
    px = mask_crop.load()
    bottom = max(y for y in range(h) for x in range(w) if px[x, y]) if True else h - 1
    band = max(6, round(h * 0.08))
    xs = [x for y in range(max(0, bottom - band), bottom + 1) for x in range(w) if px[x, y]]
    return sum(xs) / len(xs), bottom


def cut_sheet(path, count, rows):
    im = Image.open(path).convert("RGBA")
    m = alpha_mask(im)
    w, h = im.size
    px = m.load()
    row_prof = [sum(1 for x in range(w) if px[x, y]) for y in range(h)]
    bands = segments(row_prof, 6, 20, 2)
    if len(bands) != rows:
        raise SystemExit(f"{path}: found {len(bands)} rows, want {rows}")
    per_row = [count // rows + (1 if r < count % rows else 0) for r in range(rows)]
    frames = []
    for (y0, y1), want in zip(bands, per_row):
        col_prof = [sum(1 for y in range(y0, y1 + 1) if px[x, y]) for x in range(w)]
        segs = fit_count(segments(col_prof, 4, 12, 1), want, col_prof)
        for x0, x1 in segs:
            crop = im.crop((x0, y0, x1 + 1, y1 + 1))
            bb = alpha_mask(crop).getbbox()
            frames.append(crop.crop(bb))
    return frames


def register(frames):
    """Place frames on a shared canvas with feet at (cx, baseline)."""
    infos = []
    for f in frames:
        fx, fy = feet_anchor(alpha_mask(f))
        infos.append((f, fx, fy))
    half = max(max(fx, f.width - fx) for f, fx, fy in infos)
    top = max(fy for f, fx, fy in infos)
    half, top = int(half) + 3, int(top) + 3
    fw, fh = half * 2, top + 3
    out = []
    for f, fx, fy in infos:
        c = Image.new("RGBA", (fw, fh))
        c.paste(f, (round(half - fx), top - fy), f)
        out.append(c)
    return out, fw, fh, top


def zip_frames(folder, fx):
    names = sorted(n for n in os.listdir(folder) if n.startswith("frame_"))
    if not names:  # e.g. 豆奶-走路-01.png
        names = sorted(n for n in os.listdir(folder) if n.endswith(".png") and not n.startswith("fx_"))
    chars = [Image.open(os.path.join(folder, n)).convert("RGBA") for n in names]
    fxs = [Image.open(os.path.join(folder, "fx_" + n)).convert("RGBA") for n in names] if fx else []
    w, h = chars[0].size
    boxes = [alpha_mask(c).getbbox() for c in chars + fxs]
    ux0 = min(b[0] for b in boxes)
    ux1 = max(b[2] for b in boxes)
    uy0 = min(b[1] for b in boxes)
    base = max(alpha_mask(c).getbbox()[3] for c in chars)
    m0 = alpha_mask(chars[0])
    bb0 = m0.getbbox()
    ax, _ = feet_anchor(m0.crop(bb0))
    ax += bb0[0]
    half = int(max(ax - ux0, ux1 - ax)) + 3
    box = (round(ax - half), uy0 - 3, round(ax - half) + half * 2, base + 3)

    def crop(img):
        c = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]))
        c.paste(img.crop((max(0, box[0]), max(0, box[1]), min(w, box[2]), min(h, box[3]))),
                (max(0, -box[0]), max(0, -box[1])))
        return c

    fw, fh = box[2] - box[0], box[3] - box[1]
    return [crop(c) for c in chars], [crop(f) for f in fxs], fw, fh, base - box[1]


# Upright reference frame per action, used to normalise every action to one body height.
REF = {
    "nc_idle": 0, "nc_walk": 0, "nc_run": 0, "nc_jump": 0, "nc_light": 0, "nc_heavy": 0,
    "nc_special": 0, "nc_hurt": 3, "nc_down": 0, "nc_getup": 2, "nc_ko": 1, "nc_win": 4,
    "nc_laugh": 0,
    "dn_idle": 0, "dn_throw": 7, "dn_hurt": 2, "dn_death": 0, "dn_mic": 0,
    "ml_attack": 0, "ml_hurt": 3, "ml_death": 0,
    "nh_charge": 7, "nc_jattack": 3, "nc_dodge": 5,
    "nh_idle": 0, "nh_walk": 0, "nh_run": 0, "nh_hurt": 3, "nh_down": 0, "nh_getup": 4,
    "nh_ko": 5, "nh_win": 0, "nh_attack": 0, "nh_dance": 0, "dn_walk": 0, "ml_idle": 0, "ml_walk": 0, "nh_type": 0, "nh_hack": 0, "nh_hole": 0,
}


def cap_top(frame):
    """Top row of 奶察's navy cap (ignores raised batons, fists and FX lines)."""
    rgb = frame.load()
    w, h = frame.size
    for y in range(h):
        n = 0
        for x in range(w):
            r, g, b, a = rgb[x, y]
            if a > 200 and r < 70 and g < 90 and 70 <= b <= 175:
                n += 1
        if n >= 6:
            return y
    return alpha_mask(frame).getbbox()[1]


def outline(frame, color=(176, 156, 255), width=3):
    """Light rim so the black hoodie reads on a dark stage."""
    m = alpha_mask(frame)
    grown = m.filter(ImageFilter.MaxFilter(width * 2 + 1))
    rim = ImageChops.subtract(grown, m)
    layer = Image.new("RGBA", frame.size, color + (0,))
    layer.putalpha(rim.point(lambda v: 200 if v else 0))
    out = layer.copy()
    out.alpha_composite(frame)
    return out


def save_strip(key, frames, fw, fh, base, manifest, write=True):
    if write:
        strip = Image.new("RGBA", (fw * len(frames), fh))
        for i, f in enumerate(frames):
            strip.paste(f, (i * fw, 0))
        q = strip.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        q.save(os.path.join(OUT, f"{key}.png"), optimize=True)
    heights = sorted(base - alpha_mask(f).getbbox()[1] for f in frames)
    ref = frames[REF.get(key, 0)]
    top = cap_top(ref) if key.startswith("nc_") else alpha_mask(ref).getbbox()[1]
    manifest[key] = {
        "frames": len(frames), "frameWidth": fw, "frameHeight": fh,
        "originY": round(base / fh, 4), "medianHeight": heights[len(heights) // 2],
        "refHeight": base - top,
    }


def review(group, keys, frames_by_key, base_by_key):
    th = 150
    rows = []
    for k in keys:
        fr = frames_by_key[k]
        sc = th / max(f.height for f in fr)
        cells = [f.resize((max(1, round(f.width * sc)), max(1, round(f.height * sc)))) for f in fr]
        rw = sum(c.width + 6 for c in cells) + 110
        row = Image.new("RGB", (rw, th + 22), (40, 40, 52))
        d = ImageDraw.Draw(row)
        d.text((4, 4), k, fill=(255, 255, 0))
        x = 110
        for i, c in enumerate(cells):
            row.paste(c, (x, 18), c)
            by = 18 + round(base_by_key[k] * sc)
            d.line((x, by, x + c.width, by), fill=(255, 60, 60))
            d.line((x + c.width // 2, 18, x + c.width // 2, 18 + th), fill=(60, 200, 255))
            d.text((x + 2, 18), str(i), fill=(255, 255, 255))
            x += c.width + 6
        rows.append(row)
    W = max(r.width for r in rows)
    sheet = Image.new("RGB", (W, sum(r.height for r in rows)), (20, 20, 28))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(os.path.join(REVIEW, f"review_{group}.png"))


# Largest on-screen body height (px at 1920x1080) per character; bigger sources are shrunk.
SCREEN_MAX = {"nc": 340, "dn": 280, "ml": 310, "nh": 410}
SCREEN_MAX_KEY = {"dn_mic": 80}


def shrink_factor(key, ref_frame):
    limit = SCREEN_MAX_KEY.get(key, SCREEN_MAX[key[:2]])
    m = alpha_mask(ref_frame)
    bb = m.getbbox()
    top = cap_top(ref_frame) if key.startswith("nc_") else bb[1]
    h = bb[3] - top
    return min(1.0, limit / h)


def shrink(frames, k):
    if k >= 0.999:
        return frames
    return [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS) for f in frames]


manifest, frames_by_key, base_by_key = {}, {}, {}
for key, fname, count, rows in SHEETS:
    raw = cut_sheet(os.path.join(SRC, fname), count, rows)
    raw = shrink(raw, shrink_factor(key, raw[REF.get(key, 0)]))
    if key == "dn_mic":  # black mic on a dark stage → warm rim so the projectile reads
        raw = [outline(f.crop((-4, -4, f.width + 4, f.height + 4)), color=(255, 214, 120), width=3) for f in raw]
    frames, fw, fh, base = register(raw)
    save_strip(key, frames, fw, fh, base, manifest)
    frames_by_key[key], base_by_key[key] = frames, base
    print(f"{key:12} {count:2}f  cell {fw}x{fh}  refH {manifest[key]['refHeight']}")

for entry in ZIPS:
    key, folder, fx = entry[:3]
    fx_only = len(entry) > 3 and entry[3] == "fxonly"
    if folder.startswith("v2/"):  # 2026-11-05 batch: neighbour-cell slivers + magenta key fringe
        src_dir = os.path.join(UNZ, folder)
        clean_dir = os.path.join(UNZ, "clean", os.path.basename(folder))
        os.makedirs(clean_dir, exist_ok=True)
        names = sorted(n for n in os.listdir(src_dir) if n.endswith(".png"))
        cleaned = [defringe(drop_edge_fragments(Image.open(os.path.join(src_dir, n)))) for n in names]
        if key == "ml_idle":
            cleaned = normalize_heights(cleaned)
        for n, f in zip(names, cleaned):
            f.save(os.path.join(clean_dir, n))
        folder = os.path.join("clean", os.path.basename(folder))
    chars, fxs, fw, fh, base = zip_frames(os.path.join(UNZ, folder), fx)
    if key in HOODIE_REPAIR:
        chars = [repair(c) for c in chars]
    k = shrink_factor(key, chars[REF.get(key, 0)])
    if k < 0.999:
        chars, fxs = shrink(chars, k), shrink(fxs, k)
        fw, fh, base = chars[0].width, chars[0].height, round(base * k)
    if key.startswith("nh_"):
        chars = [outline(c) for c in chars]
    if fx_only:  # keep the effect layer only; its scale comes from the boss frames it was drawn with
        scratch = {}
        save_strip(key, chars, fw, fh, base, scratch, write=False)
        save_strip(key + "_fx", fxs, fw, fh, base, manifest)
        manifest[key + "_fx"]["refHeight"] = scratch[key]["refHeight"]
        frames_by_key[key + "_fx"], base_by_key[key + "_fx"] = fxs, base
    else:
        save_strip(key, chars, fw, fh, base, manifest)
        frames_by_key[key], base_by_key[key] = chars, base
    if key in HOODIE_REPAIR:
        manifest[key]["placeholder"] = "hoodie-refill"
    if fx and not fx_only:
        save_strip(key + "_fx", fxs, fw, fh, base, manifest)
        manifest[key + "_fx"]["refHeight"] = manifest[key]["refHeight"]
        last = alpha_mask(fxs[-1])
        lp = last.load()
        pts = [(x, y) for y in range(last.height) for x in range(last.width) if lp[x, y]]
        cx = sum(x for x, _ in pts) / len(pts)
        cy = sum(y for _, y in pts) / len(pts)
        manifest[key + "_fx"]["fxCenter"] = [round(cx / fw, 4), round(cy / fh, 4)]
    shown = key + "_fx" if fx_only else key
    print(f"{shown:12} {len(chars):2}f  cell {fw}x{fh}  refH {manifest[shown]['refHeight']}  shrink {k:.3f}")

for key, like in REF_LIKE.items():
    manifest[key]["refHeight"] = manifest[like]["refHeight"]
    print(f"{key:12} refHeight borrowed from {like}: {manifest[key]['refHeight']}")

with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=1)

groups = {
    "naicha_a": ["nc_idle", "nc_walk", "nc_run", "nc_hurt", "nc_down", "nc_getup"],
    "naicha_b": ["nc_light", "nc_heavy", "nc_special"],
    "naicha_c": ["nc_win", "nc_laugh"],
    "minions": ["dn_idle", "dn_throw", "dn_hurt", "dn_death", "dn_mic"],
    "boss_a": ["nh_idle", "nh_walk", "nh_run", "nh_hurt", "nh_down", "nh_getup", "nh_ko", "nh_win", "nh_attack", "nh_charge"],
    "v2_misc": ["nc_jump", "nc_ko", "nc_jattack", "nc_dodge", "dn_walk"],
    "elite_v2": ["ml_idle", "ml_walk", "ml_attack", "ml_hurt", "ml_death"],
    "boss_b": ["nh_dance"],
    "boss_c": ["nh_type", "nh_hack", "nh_hack_fx", "nh_hole", "nh_hole_fx"],
}
for g, keys in groups.items():
    review(g, keys, frames_by_key, base_by_key)
print("ok")
