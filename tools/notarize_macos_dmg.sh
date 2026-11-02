#!/usr/bin/env bash
set -euo pipefail
dmg="${1:?DMG path required}"
: "${APPLE_SIGNING_IDENTITY:?}"
: "${APPLE_API_KEY_PATH:?}"
: "${APPLE_API_KEY:?}"
: "${APPLE_API_ISSUER:?}"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$dmg"
xcrun notarytool submit "$dmg" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait --output-format json > "$RUNNER_TEMP/dmg-notary.json"
python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["status"]=="Accepted" else 1)' "$RUNNER_TEMP/dmg-notary.json"
for attempt in 1 2 3; do
  if xcrun stapler staple "$dmg"; then
    exit 0
  else
    status=$?
  fi
  # Apple's ticket delivery can lose its connection (68) or lag acceptance (65).
  # Other errors, or an exhausted retry budget, still fail the signed proof.
  if [[ "$status" != 68 && "$status" != 65 ]] || [[ "$attempt" -eq 3 ]]; then
    exit "$status"
  fi
  echo "Apple ticket retrieval failed ($status); retrying after accepted notarization."
  sleep "$((attempt * 15))"
done
