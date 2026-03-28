#!/bin/bash
# Icon Generation Script for Canopy
# Usage: ./scripts/generate-icons.sh <source-image.png>
#
# Requires:
# - Source image should be at least 1024x1024 PNG (full-bleed square)
# - Python 3 with Pillow and NumPy (pip3 install Pillow numpy)
# - macOS: iconutil (built-in)
# - Windows: ImageMagick (brew install imagemagick)
#
# This script generates platform-appropriate icons:
# - build/icon.icns  (macOS) — Apple superellipse mask + drop shadow baked in
# - build/icon.ico   (Windows) — full-bleed with transparency, OS handles backplates
# - build/icon.png   (Linux) — full-bleed with transparency, DE renders as-is
#
# macOS Note: The .icns file must have the squircle shape, transparent corners,
# and drop shadow pre-baked. macOS does NOT auto-mask .icns files — only Assets.car
# (compiled via actool) gets auto-masked. The .icns is used for DMG volume icons,
# older macOS versions, and contexts where Assets.car isn't recognized.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_IMAGE="${1:-icon-source.png}"
BUILD_DIR="build"

if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: Source image not found: $SOURCE_IMAGE"
    echo "Usage: $0 <source-image.png>"
    exit 1
fi

mkdir -p "$BUILD_DIR"

echo "Generating icons from: $SOURCE_IMAGE"

# Check for required tools
if ! python3 -c "from PIL import Image; import numpy" 2>/dev/null; then
    echo "Error: Python 3 with Pillow and NumPy required."
    echo "Install with: pip3 install Pillow numpy"
    exit 1
fi

if ! command -v iconutil &> /dev/null; then
    echo "Warning: iconutil not found (macOS only). Skipping icns generation."
    SKIP_ICNS=true
fi

if ! command -v magick &> /dev/null && ! command -v convert &> /dev/null; then
    echo "Warning: ImageMagick not found. Skipping ico generation."
    echo "Install with: brew install imagemagick"
    SKIP_ICO=true
fi

# Determine ImageMagick command (v7 uses 'magick', v6 uses 'convert')
if command -v magick &> /dev/null; then
    MAGICK="magick"
else
    MAGICK="convert"
fi

# --- Linux icon ---
# electron-builder auto-resizes build/icon.png for Linux targets.
# The source image IS icon.png (1024x1024, full-bleed) — no processing needed.
echo "Linux icon: using $BUILD_DIR/icon.png as-is (electron-builder auto-resizes)"

# --- macOS icon (.icns with superellipse mask + drop shadow) ---
if [ -z "$SKIP_ICNS" ]; then
    echo "Generating macOS icon with Apple superellipse mask..."

    # Step 1: Apply superellipse mask and drop shadow to source
    MASKED_ICON="$BUILD_DIR/.icon-masked-1024.png"
    python3 "$SCRIPT_DIR/generate-macos-icon.py" "$SOURCE_IMAGE" "$MASKED_ICON"

    # Step 2: Generate iconset from masked source
    ICONSET_DIR="$BUILD_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    # Generate all required sizes from the masked 1024x1024
    python3 -c "
from PIL import Image
import os

src = Image.open('$MASKED_ICON').convert('RGBA')
iconset = '$ICONSET_DIR'

sizes = [
    ('icon_16x16.png', 16),
    ('icon_16x16@2x.png', 32),
    ('icon_32x32.png', 32),
    ('icon_32x32@2x.png', 64),
    ('icon_128x128.png', 128),
    ('icon_128x128@2x.png', 256),
    ('icon_256x256.png', 256),
    ('icon_256x256@2x.png', 512),
    ('icon_512x512.png', 512),
    ('icon_512x512@2x.png', 1024),
]

for name, size in sizes:
    resized = src.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(iconset, name), 'PNG')

print('  Generated iconset with', len(sizes), 'sizes')
"

    # Step 3: Compile .icns
    iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
    rm -f "$MASKED_ICON"
    echo "  Created: $BUILD_DIR/icon.icns"
fi

# --- Windows icon (.ico, full-bleed with transparency) ---
# Windows expects transparent icons without squircle mask — the OS handles backplates.
# Include 256 (PNG-compressed), 128, 64, 48, 32, 24, 16 layers.
if [ -z "$SKIP_ICO" ]; then
    echo "Generating Windows icon..."
    $MAGICK "$SOURCE_IMAGE" -define icon:auto-resize=256,128,64,48,32,24,16 "$BUILD_DIR/icon.ico"
    echo "  Created: $BUILD_DIR/icon.ico"
fi

echo ""
echo "Icon generation complete!"
echo "Files created in $BUILD_DIR/:"
ls -la "$BUILD_DIR/"*.{icns,ico,png} 2>/dev/null || true
