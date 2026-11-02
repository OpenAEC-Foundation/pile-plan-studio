#!/usr/bin/env bash
set -euo pipefail
deb="${1:?}"; version="${2:?}"; output="${3:?}"
mkdir -p "$output"
test "$(dpkg-deb -f "$deb" Version)" = "$version"
test "$(dpkg-deb -f "$deb" Architecture)" = amd64
dpkg-deb -I "$deb" > "$output/package.txt"
sudo apt-get install -y "$deb"
binary=/usr/bin/pile-plan-studio
test -x "$binary"
ldd "$binary" > "$output/dependencies.txt"
! grep -q 'not found' "$output/dependencies.txt"
readelf --version-info "$binary" > "$output/elf-versions.txt"
"$binary" > "$output/launch.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
sleep 10
kill -0 "$pid"
test "$(readlink -f "/proc/$pid/exe")" = "$binary"
ps -p "$pid" -o pid=,args= > "$output/process.txt"
printf 'GUI/dialog/MCP acceptance: NOT RUN\n' > "$output/interactive-acceptance.txt"
