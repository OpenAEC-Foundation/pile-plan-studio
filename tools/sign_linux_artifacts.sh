#!/usr/bin/env bash
set -euo pipefail
: "${OPENAEC_GPG_PRIVATE_KEY:?Existing organisation credential OPENAEC_GPG_PRIVATE_KEY unavailable}"
: "${OPENAEC_GPG_FINGERPRINT:?Existing organisation variable OPENAEC_GPG_FINGERPRINT unavailable}"
cd "${1:?Artifact directory required}"
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
chmod 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent; rm -rf "$GNUPGHOME"' EXIT
printf '%s' "$OPENAEC_GPG_PRIVATE_KEY" | gpg --batch --import
fingerprint=$(printf '%s' "$OPENAEC_GPG_FINGERPRINT" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
[[ "$fingerprint" =~ ^([A-F0-9]{40}|[A-F0-9]{64})$ ]]
actual=$(gpg --batch --with-colons --list-secret-keys "$fingerprint" | awk -F: '$1=="fpr" {print $10; exit}')
test "$actual" = "$fingerprint"
shopt -s nullglob
packages=(*.AppImage *.deb)
test "${#packages[@]}" -eq 2
sha256sum "${packages[@]}" > SHA256SUMS
for file in "${packages[@]}" SHA256SUMS; do
  printf '%s' "${OPENAEC_GPG_PASSPHRASE:-}" | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 --local-user "$fingerprint" --armor --detach-sign "$file"
done
gpg --armor --export "$fingerprint" > linux-signing-public-key.asc
printf '%s\n' "$fingerprint" > linux-signing-fingerprint.txt
verify=$(mktemp -d)
trap 'gpgconf --kill gpg-agent; rm -rf "$GNUPGHOME" "$verify"' EXIT
chmod 700 "$verify"
gpg --homedir "$verify" --batch --import linux-signing-public-key.asc
for file in "${packages[@]}" SHA256SUMS; do gpg --homedir "$verify" --batch --verify "$file.asc" "$file"; done
sha256sum --check SHA256SUMS
