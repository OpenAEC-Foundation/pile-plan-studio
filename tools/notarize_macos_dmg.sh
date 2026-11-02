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
source "$(dirname "$0")/apple_ticket.sh"
apple_ticket staple "$dmg"
