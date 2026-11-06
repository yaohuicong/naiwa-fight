"""Process the 2026-11-05 Drive batch (场景 / UI / FX) into public/assets/{stage,ui,fx} + meta json."""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cleanup import defringe  # noqa: E402

ROOT = sys.argv[1]
V2 = os.path.join(ROOT, "drive-assets", "v2")
V3 = os.path.join(ROOT, "drive-assets", "v3")  # 2026-11-06「审查重做」
PUB = os.path.join(ROOT, "public", "assets")
for d in ("stage", "ui", "fx"):
    os.makedirs(os.path.join(PUB, d), exist_ok=True)
meta = {"stage": {}, "ui": {}, "fx": {}}


def load(folder, name):
    return Image.open(os.path.join(V2, folder, name)).convert("RGBA")


def save(img, sub, key, lossless=True):
    path = os.path.join(PUB, sub, key + ".webp")
    img.save(path, "WEBP", lossless=lossless, quality=100 if lossless else 90, method=4)
    return f"assets/{sub}/{key}.webp"


def fade_left(img, px):
    a = img.getchannel("A")
    ap = a.load()
    for x in range(min(px, img.width)):
        k = x / px
        for y in range(img.height):
            ap[x, y] = int(ap[x, y] * k)
    img.putalpha(a)
    return img


# ── 场景 ──
SEG = ["A巷口", "B便利店段", "C后巷段", "D网咖门口"]
st = meta["stage"]
st["sky"] = save(load("场景", "场景-死巷-L0天空.png"), "stage", "l0_sky", lossless=False)
st["far"] = save(load("场景", "场景-死巷-L1远景.png"), "stage", "l1_far")
for k in ("mid", "near", "front"):
    st[k], st[k + "Off"] = [], []


def save_trim(img, layer, key):
    """Crop to the alpha bbox (less overdraw) and remember where it sits in the 1920×1080 frame."""
    bb = img.getchannel("A").point(lambda v: 255 if v > 4 else 0).getbbox()
    st[layer].append(save(img.crop(bb), "stage", key))
    st[layer + "Off"].append([bb[0], bb[1]])


for i, s in enumerate(SEG):
    mid = defringe(load("场景", f"场景-死巷-L2中景-{s}.png"), depth=3)
    if i > 0:
        mid = fade_left(mid, 384)  # cross-fade with the previous segment (parallax 0.8 overlap)
    save_trim(mid, "mid", f"l2_mid_{i}")
    save_trim(defringe(load("场景", f"场景-死巷-L3近景-{s}.png"), depth=3), "near", f"l3_near_{i}")
# 前景 v2：只占画面最底下 120px（角色脚底以下），整关平铺，画在角色前面
save_trim(Image.open(os.path.join(V3, "p2", "场景-死巷-前景-v2.png")).convert("RGBA"), "front", "l5_front_v2")
st["ground"] = save(load("场景", "场景-死巷-L4地面-平铺.png"), "stage", "l4_ground")
st["fog"] = save(defringe(load("场景", "场景-死巷-雾带.png")), "stage", "fog")
st["lamp"] = save(load("场景", "场景道具-路灯.png"), "stage", "lamp")
st["lampGlow"] = save(load("场景", "场景道具-路灯光晕.png"), "stage", "lamp_glow")
st["puddles"] = save(load("场景", "场景道具-水坑-3款.png"), "stage", "puddles")
st["gate"] = save(load("场景", "场景道具-锁屏光栅-6帧表.png"), "stage", "gate")
for k, n in (("neonTea", "奶茶"), ("neonShop", "便利店"), ("neonNet", "网咖")):
    st[k] = save(load("场景", f"场景道具-霓虹-{n}-4帧表.png"), "stage", f"neon_{k}")

# 可破坏物（2 行 × 3 帧：垃圾桶 / 纸箱 × 完好、开裂、碎裂）与掉落物（小杯奶茶 / 大杯奶茶 / 能量奶瓶）
st["breakables"] = save(Image.open(os.path.join(V3, "p1", "道具-可破坏物-2种.png")).convert("RGBA"), "stage", "breakables")
st["pickups"] = save(Image.open(os.path.join(V3, "p1", "道具-掉落物-3种.png")).convert("RGBA"), "stage", "pickups")

# ── UI ──
ui = meta["ui"]
ui["titleArt"] = {"url": save(Image.open(os.path.join(V3, "p2", "UI-标题主视觉.webp")).convert("RGB"), "ui", "title_art", lossless=False)}


def crop_save(name, key):
    im = load("UI", name)
    bb = im.getchannel("A").getbbox()
    c = im.crop(bb)
    c.save(os.path.join(PUB, "ui", key + ".png"), optimize=True)
    ui[key] = {"url": f"assets/ui/{key}.png", "w": c.width, "h": c.height}
    return c


def groove(img):
    """Dark inner slot of a bar frame: scan from the centre outwards."""
    px = img.load()
    w, h = img.size
    cx, cy = w // 2, h // 2
    dark = lambda p: p[3] > 200 and (p[0] + p[1] + p[2]) / 3 < 60
    x0 = cx
    while x0 > 0 and dark(px[x0 - 1, cy]):
        x0 -= 1
    x1 = cx
    while x1 < w - 1 and dark(px[x1 + 1, cy]):
        x1 += 1
    y0 = cy
    while y0 > 0 and dark(px[cx, y0 - 1]):
        y0 -= 1
    y1 = cy
    while y1 < h - 1 and dark(px[cx, y1 + 1]):
        y1 += 1
    return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]


for name, key in [("UI-关卡面板-框.png", "stagePanel"), ("UI-连击面板-框.png", "comboPanel"), ("UI-目标提示-框.png", "goalBar"),
                  ("UI-横幅-框.png", "banner"), ("UI-面板-框.png", "panel"), ("UI-标题Logo.png", "logo"),
                  ("UI-头像-奶察.png", "portraitNc"), ("UI-头像-奶豪.png", "portraitNh"), ("UI-小血条-框.png", "miniBar")]:
    crop_save(name, key)
for name, key in [("UI-血条-奶察-框.png", "hpFrame"), ("UI-血条-Boss-框.png", "bossFrame")]:
    c = crop_save(name, key)
    ui[key]["groove"] = groove(c)
fills = load("UI", "UI-血条-填充-3色.png")
for i, key in enumerate(("fillHp", "fillTrail", "fillEnergy")):
    f = fills.crop((0, i * 24, 600, i * 24 + 24))
    f.save(os.path.join(PUB, "ui", key + ".png"))
    ui[key] = {"url": f"assets/ui/{key}.png", "w": 600, "h": 24}
for name, key, fw, fh in [("UI-关卡节点-3态.png", "nodes", 48, 48), ("UI-图标-Boss状态.png", "bossIcons", 40, 40),
                          ("UI-箭头-GO-3帧表.png", "goArrow", 96, 64), ("UI-字体-连击数字.png", "comboDigits", 64, 96),
                          ("UI-字体-伤害数字.png", "dmgDigits", 32, 44), ("UI-按钮-3态.png", "buttons", 360, 72)]:
    im = load("UI", name)
    im.save(os.path.join(PUB, "ui", key + ".png"), optimize=True)
    ui[key] = {"url": f"assets/ui/{key}.png", "frameWidth": fw, "frameHeight": fh}
ko = load("UI", "UI-字样-KO-通关.png")
ko.crop(ko.crop((0, 0, 800, 250)).getchannel("A").getbbox()).save(os.path.join(PUB, "ui", "koWord.png"))
bot = ko.crop((0, 250, 800, 480))
bot.crop(bot.getchannel("A").getbbox()).save(os.path.join(PUB, "ui", "clearWord.png"))
ui["koWord"] = {"url": "assets/ui/koWord.png"}
ui["clearWord"] = {"url": "assets/ui/clearWord.png"}

# ── FX ──
fx = meta["fx"]


def strip(name, key, fw, fh, fix=None):
    im = load("FX", name)
    if fix:
        im = fix(im)
    im.save(os.path.join(PUB, "fx", key + ".png"), optimize=True)
    n = im.width // fw
    fx[key] = {"url": f"assets/fx/{key}.png", "frameWidth": fw, "frameHeight": fh, "frames": n}
    return im


def no_black(im):
    """Trail frames have a solid black core; keep only the light arc."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            lum = (r + g + b) / 3
            if a and lum < 70:
                px[x, y] = (r, g, b, int(a * max(0.0, (lum - 30) / 40)))
    return im


strip("FX-命中火花-轻-6帧表.png", "sparkLight", 96, 96)
strip("FX-命中火花-重-8帧表.png", "sparkHeavy", 160, 160)
strip("FX-挥棍拖影-轻重-帧表.png", "trail", 256, 192, no_black)
strip("FX-受击飞溅-6帧表.png", "splash", 128, 128)
strip("FX-尘土-6帧表.png", "dust", 192, 96)
strip("FX-小兵消散-8帧表.png", "poof", 192, 192)
strip("FX-麦克风弹开-6帧表.png", "micBreak", 96, 96)
strip("FX-大招就绪-8帧表.png", "superReady", 256, 256)
strip("FX-预警圈-6帧表.png", "warnRing", 256, 64)
strip("FX-地面雨溅-8帧表.png", "rainSplash", 32, 32)
for name, key in (("FX-独舞水波环-普通-8帧表.png", "ringNormal"), ("FX-独舞水波环-节拍-8帧表.png", "ringBeat")):
    im = strip(name, key, 512, 128)
    halves = []
    for i in range(8):
        bb = im.crop((i * 512, 0, i * 512 + 512, 128)).getchannel("A").point(lambda v: 255 if v > 60 else 0).getbbox()
        halves.append(round(max(abs(bb[0] - 256), abs(bb[2] - 256)), 1) if bb else 256)
    fx[key]["halfWidth"] = halves
rain = load("FX", "FX-雨丝-前后两层.png")
rain.crop((0, 0, 512, 512)).save(os.path.join(PUB, "fx", "rainBack.png"))
rain.crop((512, 0, 1024, 512)).save(os.path.join(PUB, "fx", "rainFront.png"))
fx["rainBack"] = {"url": "assets/fx/rainBack.png"}
fx["rainFront"] = {"url": "assets/fx/rainFront.png"}

with open(os.path.join(PUB, "assets_v2.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
print(json.dumps({"hpGroove": ui["hpFrame"]["groove"], "bossGroove": ui["bossFrame"]["groove"],
                  "hp": [ui["hpFrame"]["w"], ui["hpFrame"]["h"]], "boss": [ui["bossFrame"]["w"], ui["bossFrame"]["h"]],
                  "rings": [fx["ringNormal"]["halfWidth"], fx["ringBeat"]["halfWidth"]]}, ensure_ascii=False))
