"""Print size/mode of sheet PNGs and frame PNGs, plus alpha bbox, to plan slicing."""
import os, sys
from PIL import Image
root = sys.argv[1]
for dirpath, _, files in sorted(os.walk(root)):
    for f in sorted(files):
        if not f.lower().endswith(".png"):
            continue
        p = os.path.join(dirpath, f)
        im = Image.open(p)
        bbox = im.getchannel("A").getbbox() if im.mode == "RGBA" else None
        print(f"{im.size[0]:>5}x{im.size[1]:<5} {im.mode:5} bbox={bbox}  {os.path.relpath(p, root)}")
