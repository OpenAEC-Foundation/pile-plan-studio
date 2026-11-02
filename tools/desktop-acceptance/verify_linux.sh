#!/usr/bin/env bash
set -euo pipefail
packages="${1:?}"; output="${2:?}"
mkdir -p "$output"
export GNUPGHOME
GNUPGHOME=$(mktemp -d)
trap 'rm -rf "$GNUPGHOME"' EXIT
chmod 700 "$GNUPGHOME"
gpg --batch --import "$packages/linux-signing-public-key.asc"
primary=13F6D414ADEE4ED4CD09AC60601D86C93C504D29
for file in "$packages/"*.deb "$packages/"*.AppImage "$packages/SHA256SUMS"; do
  gpg --batch --status-fd 1 --verify "$file.asc" "$file" > "$output/$(basename "$file").gpg.txt"
  awk -v expected="$primary" '$2=="VALIDSIG" && ($3==expected || $NF==expected) {valid=1} END {exit !valid}' "$output/$(basename "$file").gpg.txt"
done
(cd "$packages" && sha256sum --check SHA256SUMS)
cp "$packages/SHA256SUMS" "$output/SHA256SUMS"
