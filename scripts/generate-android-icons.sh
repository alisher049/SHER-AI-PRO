#!/usr/bin/env bash
set -euo pipefail

LOGO="public/waris-logo.jpg"
RES="android/app/src/main/res"
test -s "$LOGO"

python3 - "$LOGO" "$RES" <<'PY'
import os, sys
from PIL import Image, ImageOps

logo_path, res = sys.argv[1], sys.argv[2]
source = Image.open(logo_path).convert("RGBA")
# Crop to a square while preserving the center of the supplied final logo.
square = ImageOps.fit(source, (512, 512), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, size in sizes.items():
    folder = os.path.join(res, "mipmap-" + density)
    os.makedirs(folder, exist_ok=True)
    icon = square.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(os.path.join(folder, "ic_launcher.png"), optimize=True)
    icon.save(os.path.join(folder, "ic_launcher_round.png"), optimize=True)

drawable = os.path.join(res, "drawable")
adaptive = os.path.join(res, "mipmap-anydpi-v26")
values = os.path.join(res, "values")
for folder in (drawable, adaptive, values):
    os.makedirs(folder, exist_ok=True)
# Keep a safe inset so the complete logo remains visible inside adaptive masks.
foreground = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
mark = ImageOps.contain(square, (340, 340), method=Image.Resampling.LANCZOS)
foreground.alpha_composite(mark, ((432-mark.width)//2, (432-mark.height)//2))
foreground.save(os.path.join(drawable, "ic_launcher_foreground.png"), optimize=True)

with open(os.path.join(values, "colors.xml"), "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#080B14</color></resources>\n')
for icon_name in ("ic_launcher", "ic_launcher_round"):
    with open(os.path.join(adaptive, icon_name + ".xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n')
        f.write('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n')
        f.write('  <background android:drawable="@color/ic_launcher_background"/>\n')
        f.write('  <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n')
        f.write('</adaptive-icon>\n')

strings = os.path.join(values, "strings.xml")
if os.path.exists(strings):
    import re
    text = open(strings, encoding="utf-8").read()
    if re.search(r'<string name="app_name">.*?</string>', text, re.S):
        text = re.sub(r'<string name="app_name">.*?</string>', '<string name="app_name">SHER AI PRO</string>', text, count=1, flags=re.S)
    else:
        text = text.replace("</resources>", '  <string name="app_name">SHER AI PRO</string>\n</resources>')
else:
    text = '<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="app_name">SHER AI PRO</string></resources>\n'
open(strings, "w", encoding="utf-8").write(text)
print("Custom WARIS artwork installed as launcher/adaptive icons; app label set to SHER AI PRO.")
PY
