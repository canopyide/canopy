#!/usr/bin/env bash
# Canopy CLI — opens a directory as a project in the Canopy app.
# Usage: canopy [directory]   (defaults to current directory)
set -euo pipefail

TARGET="${1:-.}"

# Resolve to an absolute directory path without external runtime dependencies
ABSOLUTE_PATH="$(cd -- "$TARGET" 2>/dev/null && pwd -P)" || ABSOLUTE_PATH=""

if [[ -z "$ABSOLUTE_PATH" || ! -d "$ABSOLUTE_PATH" ]]; then
  echo "canopy: '$TARGET' is not a directory" >&2
  exit 1
fi

resolve_script_path() {
  local source="$1"

  while [[ -h "$source" ]]; do
    local dir=""
    dir="$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done

  local source_dir=""
  source_dir="$(cd -P "$(dirname "$source")" >/dev/null 2>&1 && pwd)"
  printf "%s/%s\n" "$source_dir" "$(basename "$source")"
}

# --- macOS: locate the Canopy.app bundle ---
if [[ "$(uname)" == "Darwin" ]]; then
  # Prefer deriving the app path from the installed symlink target.
  APP_PATH=""
  SCRIPT_PATH="$(resolve_script_path "${BASH_SOURCE[0]}")"
  if [[ "$SCRIPT_PATH" == *".app/"* ]]; then
    APP_PATH="${SCRIPT_PATH%%.app/*}.app"
  fi

  # Fall back to Spotlight if the script is not installed as an app symlink.
  if [[ -z "$APP_PATH" ]] && command -v mdfind &>/dev/null; then
    APP_PATH="$(mdfind 'kMDItemCFBundleIdentifier == "com.canopy.commandcenter"' 2>/dev/null | head -1)"
    [[ -n "$APP_PATH" && ! -d "$APP_PATH" ]] && APP_PATH=""
  fi

  # Fall back to common locations.
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
