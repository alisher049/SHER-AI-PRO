#!/usr/bin/env bash
# Generate Android launcher icons. Do not use "set -e": harmless shell
# warnings must not abort the build. Python errors still return a failure code.

python3 - <<'PY'
from pathlib import Path
from PIL import Image

logo = Path("public/waris-logo.jpg")
res = Path("android/app/src/main/res")

if not logo.is_file():
    raise FileNotFoundError(f"Logo not found: {logo}")

sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

with Image.open(logo) as original:
    image = original.convert("RGB")
    for folder_name, size in sizes.items():
        folder = res / folder_name
        folder.mkdir(parents=True, exist_ok=True)
        icon = image.resize((size, size), Image.Resampling.LANCZOS)
        for filename in ("ic_launcher.png", "ic_launcher_round.png"):
            icon.save(folder / filename, format="PNG", optimize=True)

print("Android mipmap launcher icons generated successfully.")
PY
