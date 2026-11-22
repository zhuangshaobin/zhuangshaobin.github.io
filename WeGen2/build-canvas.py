"""Pack full-frame canvas previews; original artwork and prompts stay untouched.

Run with Python and Pillow after changing gallery.json, canopy.json or scroll.json.
The small atlas is sized for the largest CSS tile; the detail atlas supports 2x
displays. Edge padding keeps adjacent artworks from bleeding into each other.
"""

from pathlib import Path
import hashlib
import io
import json
import math

from PIL import Image


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "canvas-atlas"
OUT.mkdir(exist_ok=True)


def read(name):
    return json.loads((ROOT / name).read_text())


works = {item["id"]: item for item in read("gallery.json")}
groups = []
upper = read("canopy.json")
upper = [item for group in upper for item in group] if isinstance(upper[0], list) else upper
for start in range(0, len(upper), 6):
    ids = upper[start:start + 6]
    groups.append(("upper", ids, [160 * works[id]["width"] / works[id]["height"] for id in ids]))
for ids in read("scroll.json"):
    ratios = [works[id]["width"] / works[id]["height"] for id in ids]
    compact, dense = len(ids) == 4, len(ids) == 10
    feature = [0, 2] if compact else [0, 4, 7] if dense else [0, 4]
    left = [2, 5, 8] if dense else [2, 5]
    right = [3, 6, 9] if dense else [3, 6]
    feature_width = 416 / sum(1 / ratios[i] for i in feature)
    if compact:
        widths = [feature_width if i in feature else 416 / (1 / ratios[1] + 1 / ratios[3]) for i in range(4)]
    else:
        a, b = 1 / sum(1 / ratios[i] for i in left), 1 / sum(1 / ratios[i] for i in right)
        cluster_width = 416 / (1 / ratios[1] + 1 / (a + b))
        widths = [feature_width if i in feature else cluster_width if i == 1 else cluster_width * (a if i in left else b) / (a + b) for i in range(len(ids))]
    groups.append(("lower", ids, widths))

manifest = {"groups": [], "items": {}}
for kind, ids, widths in groups:
    key = f"{kind}-{len(manifest['groups']):02d}"
    # A deterministic shelf pack, with all coordinates shared by both versions.
    padding, limit = 2, 640
    x = y = row_height = sheet_width = 0
    tiles = []
    for id, width in zip(ids, widths):
        item = works[id]
        w = math.ceil(width)
        h = round(w * item["height"] / item["width"])
        if x and x + w + padding * 2 > limit:
            x, y, row_height = 0, y + row_height, 0
        tiles.append({"id": id, "x": x + padding, "y": y + padding, "width": w, "height": h})
        x += w + padding * 2
        row_height = max(row_height, h + padding * 2)
        sheet_width = max(sheet_width, x)
    sheet_height = y + row_height
    paths = []
    for scale, quality in [(1, 80), (2, 88)]:
        sheet = Image.new("RGB", (sheet_width * scale, sheet_height * scale), "white")
        for tile in tiles:
            item = works[tile["id"]]
            source = ROOT / "assets" / "gallery" / f"{item.get('asset', item['id'])}.webp"
            with Image.open(source) as im:
                w, h = tile["width"] * scale, tile["height"] * scale
                thumb = im.convert("RGB").resize((w, h), Image.Resampling.LANCZOS)
            tx, ty, pad = tile["x"] * scale, tile["y"] * scale, padding * scale
            sheet.paste(thumb.resize((w + pad * 2, h + pad * 2)), (tx - pad, ty - pad))
            sheet.paste(thumb.crop((0, 0, 1, h)).resize((pad, h)), (tx - pad, ty))
            sheet.paste(thumb.crop((w - 1, 0, w, h)).resize((pad, h)), (tx + w, ty))
            sheet.paste(thumb.crop((0, 0, w, 1)).resize((w, pad)), (tx, ty - pad))
            sheet.paste(thumb.crop((0, h - 1, w, h)).resize((w, pad)), (tx, ty + h))
            sheet.paste(thumb, (tx, ty))
        data = io.BytesIO()
        sheet.save(data, "WEBP", quality=quality, method=6)
        payload = data.getvalue()
        filename = f"{key}-{scale}x-{hashlib.sha256(payload).hexdigest()[:10]}.webp"
        (OUT / filename).write_bytes(payload)
        paths.append(f"assets/canvas-atlas/{filename}")
    manifest["groups"].append({"id": key, "preview": paths[0], "detail": paths[1], "width": sheet_width, "height": sheet_height, "cases": ids})
    for tile in tiles:
        manifest["items"][tile.pop("id")] = {"group": key, **tile}
(ROOT / "canvas-atlas.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Packed {len(manifest['items'])} full-frame cases in {len(groups)} atlas pairs.")
