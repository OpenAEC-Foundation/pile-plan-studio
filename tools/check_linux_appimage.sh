#!/usr/bin/env bash
# Normal FUSE launch; extraction is not substituted for this proof.
set -euo pipefail
image="${1:?}"; output="${2:?}"
mkdir -p "$output"
chmod +x "$image"
sha256sum "$image" > "$output/AppImage.sha256"
"$image" > "$output/appimage-launch.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true' EXIT
sleep 10
kill -0 "$pid"
readlink -f "/proc/$pid/exe" > "$output/appimage-process-path.txt"
ps -p "$pid" -o pid=,args= > "$output/appimage-process.txt"
printf 'GUI/dialog/MCP acceptance: NOT RUN\n' > "$output/interactive-acceptance.txt"
