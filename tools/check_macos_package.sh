#!/usr/bin/env bash
# Inspects the delivered bytes. Interactive application acceptance is separate.
set -euo pipefail
source "$(dirname "$0")/apple_ticket.sh"
dmg="${1:?}"; version="${2:?}"; mode="${3:?}"; output="${4:?}"
mkdir -p "$output"
shasum -a 256 "$dmg" > "$output/SHA256SUMS"
if [[ "$mode" == signed ]]; then
  codesign --verify --verbose=2 "$dmg"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg"
  apple_ticket validate "$dmg"
fi
mount=$(mktemp -d)
trap 'hdiutil detach "$mount" >/dev/null 2>&1 || true; rmdir "$mount" || true' EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$mount" "$dmg"
shopt -s nullglob
apps=("$mount/"*.app); test "${#apps[@]}" -eq 1
app="$output/$(basename "${apps[0]}")"
ditto "${apps[0]}" "$app"
plist="$app/Contents/Info.plist"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")" = "$version"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")" = 15.0
binary="$app/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")"
lipo "$binary" -verify_arch arm64 x86_64
otool -L "$binary" > "$output/dependencies.txt"
otool -l "$binary" > "$output/macho.txt"
if [[ "$mode" == signed ]]; then
  codesign --verify --deep --strict --verbose=2 "$app"
  codesign -dv --verbose=4 "$app" 2> "$output/signature.txt"
  : "${APPLE_SIGNING_IDENTITY:?Expected signing identity required}"
  grep -Fxq "Authority=$APPLE_SIGNING_IDENTITY" "$output/signature.txt"
  grep -q '^Authority=Developer ID Application:' "$output/signature.txt"
  grep -q '^Timestamp=' "$output/signature.txt"
  grep -q 'flags=.*runtime' "$output/signature.txt"
  spctl --assess --type execute --verbose=4 "$app"
  apple_ticket validate "$app"
fi
# An exact binary launch only; never claim this proves webview/UI readiness.
"$binary" > "$output/launch.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; hdiutil detach "$mount" >/dev/null 2>&1 || true; rmdir "$mount" || true' EXIT
sleep 10
kill -0 "$pid"
ps -p "$pid" -o pid=,command= > "$output/process.txt"
printf 'GUI/dialog/MCP acceptance: NOT RUN\n' > "$output/interactive-acceptance.txt"
