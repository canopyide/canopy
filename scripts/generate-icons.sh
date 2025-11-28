#!/bin/bash
# Icon Generation Script for Canopy
# Usage: ./scripts/generate-icons.sh <source-image.png>
#
# Requires:
# - Source image should be at least 1024x1024 PNG
# - macOS: sips, iconutil (built-in)
# - Windows: ImageMagick (brew install imagemagick)
#
# This script generates:
# - build/icon.icns (macOS)
# - build/icon.ico (Windows)
# - build/icon.png (Linux)

set -e

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
if ! command -v sips &> /dev/null; then
    echo "Warning: sips not found (macOS only). Skipping icns generation."
    SKIP_ICNS=true
fi

if ! command -v convert &> /dev/null; then
    echo "Warning: ImageMagick not found. Skipping ico generation."
    echo "Install with: brew install imagemagick"
    SKIP_ICO=true
fi

# Generate Linux icon (512x512 PNG)
echo "Generating Linux icon..."
sips -z 512 512 "$SOURCE_IMAGE" --out "$BUILD_DIR/icon.png" 2>/dev/null || cp "$SOURCE_IMAGE" "$BUILD_DIR/icon.png"

# Generate macOS icon (.icns)
if [ -z "$SKIP_ICNS" ]; then
    echo "Generating macOS icon..."
    ICONSET_DIR="$BUILD_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"

    sips -z 16 16     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16.png"
    sips -z 32 32     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16@2x.png"
    sips -z 32 32     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32.png"
    sips -z 64 64     "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32@2x.png"
    sips -z 128 128   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128.png"
    sips -z 256 256   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128@2x.png"
    sips -z 256 256   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256.png"
    sips -z 512 512   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256@2x.png"
    sips -z 512 512   "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512.png"
    sips -z 1024 1024 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512@2x.png"

    iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
    echo "Created: $BUILD_DIR/icon.icns"
fi

# Generate Windows icon (.ico)
if [ -z "$SKIP_ICO" ]; then
    echo "Generating Windows icon..."
    convert "$SOURCE_IMAGE" -define icon:auto-resize=256,128,64,48,32,16 "$BUILD_DIR/icon.ico"
    echo "Created: $BUILD_DIR/icon.ico"
fi

echo ""
echo "Icon generation complete!"
echo "Files created in $BUILD_DIR/:"
ls -la "$BUILD_DIR/"*.{icns,ico,png} 2>/dev/null || true
