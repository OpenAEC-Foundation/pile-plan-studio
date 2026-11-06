#!/usr/bin/env bash
set -euo pipefail
root=$(pwd)
scratch=$(mktemp -d)
export GNUPGHOME="$scratch/keyring"
mkdir -m 700 "$GNUPGHOME"
trap 'gpgconf --kill gpg-agent; rm -rf "$scratch"' EXIT
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Disposable distribution test' ed25519 cert 1d
export OPENAEC_GPG_FINGERPRINT
OPENAEC_GPG_FINGERPRINT=$(gpg --with-colons --list-secret-keys | awk -F: '$1=="fpr" {print $10; exit}')
gpg --batch --pinentry-mode loopback --passphrase '' --quick-add-key "$OPENAEC_GPG_FINGERPRINT" ed25519 sign 1d
export OPENAEC_GPG_PRIVATE_KEY
OPENAEC_GPG_PRIVATE_KEY=$(gpg --armor --export-secret-subkeys "$OPENAEC_GPG_FINGERPRINT")
export OPENAEC_GPG_PASSPHRASE=''
mkdir "$scratch/packages"
printf 'test AppImage bytes' > "$scratch/packages/test.AppImage"
printf 'test deb bytes' > "$scratch/packages/test.deb"
bash "$root/tools/sign_linux_artifacts.sh" "$scratch/packages"
gpg --verify "$scratch/packages/SHA256SUMS.asc" "$scratch/packages/SHA256SUMS"
printf 'tampered' >> "$scratch/packages/test.AppImage"
if gpg --verify "$scratch/packages/test.AppImage.asc" "$scratch/packages/test.AppImage"; then
  echo 'Tampered package accepted' >&2; exit 1
fi
if OPENAEC_GPG_FINGERPRINT=0000000000000000000000000000000000000000 bash "$root/tools/sign_linux_artifacts.sh" "$scratch/packages"; then
  echo 'Wrong fingerprint accepted' >&2; exit 1
fi
echo 'Linux signing round-trip and negative checks passed.'
