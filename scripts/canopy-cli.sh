#!/usr/bin/env bash
# Canopy CLI — opens a directory as a project in the Canopy app.
# Usage: canopy [directory]   (defaults to current directory)
# Version: CANOPY_APP_VERSION (replaced at install time)
set -euo pipefail

TARGET="${1:-.}"

# Resolve to absolute path — guard each method against failure
ABSOLUTE_PATH=""
if command -v realpath &>/dev/null; then
  ABSOLUTE_PATH="$(realpath -- "$TARGET" 2>/dev/null)" || ABSOLUTE_PATH=""
fi
if [[ -z "$ABSOLUTE_PATH" ]] && command -v python3 &>/dev/null; then
  ABSOLUTE_PATH="$(python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" -- "$TARGET" 2>/dev/null)" || ABSOLUTE_PATH=""
fi
if [[ -z "$ABSOLUTE_PATH" ]]; then
  ABSOLUTE_PATH="$(cd -- "$TARGET" 2>/dev/null && pwd -P)" || ABSOLUTE_PATH=""
fi

if [[ -z "$ABSOLUTE_PATH" || ! -d "$ABSOLUTE_PATH" ]]; then
  echo "canopy: '$TARGET' is not a directory" >&2
  exit 1
fi

# --- macOS: locate the Canopy.app bundle ---
if [[ "$(uname)" == "Darwin" ]]; then
  # Try mdfind (Spotlight) first for a dynamic location
  APP_PATH=""
  if command -v mdfind &>/dev/null; then
    APP_PATH="$(mdfind 'kMDItemCFBundleIdentifier == "com.canopy.commandcenter"' 2>/dev/null | head -1)"
    # Validate that mdfind returned a real .app bundle
    if [[ -n "$APP_PATH" && ! -d "$APP_PATH" ]]; then
      APP_PATH=""
    fi
  fi

  # Fall back to common locations
  if [[ -z "$APP_PATH" ]]; then
    for candidate in \
      "$HOME/Applications/Canopy.app" \
      "/Applications/Canopy.app"; do
      if [[ -d "$candidate" ]]; then
        APP_PATH="$candidate"
        break
      fi
    done
  fi

  if [[ -z "$APP_PATH" ]]; then
    echo "canopy: Canopy.app not found. Please install Canopy first." >&2
    exit 1
  fi

  # open -a respects single-instance; the app's second-instance handler picks up --cli-path
  open -a "$APP_PATH" --args --cli-path "$ABSOLUTE_PATH"
  exit 0
fi

# --- Linux fallback ---
if command -v canopy-app &>/dev/null; then
  canopy-app --cli-path "$ABSOLUTE_PATH" &
  exit 0
fi

echo "canopy: Canopy executable not found." >&2
exit 1
