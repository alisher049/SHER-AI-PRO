#!/usr/bin/env bash
set -euo pipefail
LOGO="public/waris-logo.jpg"
RES="android/app/src/main/res"
test -s "$LOGO"
command -v convert >/dev/null || { echo "ImageMagick convert is required"; exit 1; }
declare -A sizes=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
for density in "${!sizes[@]}"; do
  dir="$RES/mipmap-$density"
  mkdir -p "$dir"
  convert "$LOGO" -resize "${sizes[$density]}x${sizes[$density]}^" -gravity center -extent "${sizes[$density]}x${sizes[$density]}" "$dir/ic_launcher.png"
  cp "$dir/ic_launcher.png" "$dir/ic_launcher_round.png"
done
mkdir -p "$RES/drawable" "$RES/mipmap-anydpi-v26" "$RES/values"
convert "$LOGO" -resize 432x432^ -gravity center -extent 432x432 "$RES/drawable/ic_launcher_foreground.png"
cat > "$RES/values/colors.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#080B14</color></resources>
EOF
for icon in ic_launcher ic_launcher_round; do
cat > "$RES/mipmap-anydpi-v26/$icon.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
EOF
done
STRINGS="$RES/values/strings.xml"
if [ -f "$STRINGS" ]; then
  if grep -q 'name="app_name"' "$STRINGS"; then
    sed -i 's#<string name="app_name">[^<]*</string>#<string name="app_name">WARIS</string>#' "$STRINGS"
  else
    sed -i 's#</resources>#  <string name="app_name">WARIS</string>\n</resources>#' "$STRINGS"
  fi
else
  printf '%s\n' '<?xml version="1.0" encoding="utf-8"?>' '<resources><string name="app_name">WARIS</string></resources>' > "$STRINGS"
fi
echo "WARIS launcher icons and Android app label installed."
