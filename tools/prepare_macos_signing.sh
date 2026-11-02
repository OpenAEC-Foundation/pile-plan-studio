#!/usr/bin/env bash
set -euo pipefail
: "${APPLE_CERTIFICATE:?Existing organisation credential APPLE_CERTIFICATE unavailable}"
for name in APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_API_KEY_CONTENT APPLE_API_KEY APPLE_API_ISSUER RUNNER_TEMP GITHUB_ENV; do
  test -n "${!name:-}" || { echo "Required setting unavailable: $name" >&2; exit 1; }
done
umask 077
keychain="$RUNNER_TEMP/pile-plan-signing.keychain-db"
cert="$RUNNER_TEMP/pile-plan-signing.p12"
key="$RUNNER_TEMP/pile-plan-notary.p8"
password=$(openssl rand -base64 32)
echo "::add-mask::$password"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$cert"
printf '%s' "$APPLE_API_KEY_CONTENT" > "$key"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$cert" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain"
security list-keychains -d user -s "$keychain"
security find-identity -v -p codesigning "$keychain" | grep -Fq "$APPLE_SIGNING_IDENTITY"
rm -f "$cert"
printf 'APPLE_API_KEY_PATH=%s\n' "$key" >> "$GITHUB_ENV"
