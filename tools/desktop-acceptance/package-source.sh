#!/usr/bin/env bash
set -euo pipefail

runner="${1:?package source runner is required}"
reuse_run_id="${2:-}"
package_run_id="${reuse_run_id:-$GITHUB_RUN_ID}"
api="repos/$GITHUB_REPOSITORY/actions/runs/$package_run_id"
source="$RUNNER_TEMP/package-source.json"
source_tests="$RUNNER_TEMP/package-source-tests.json"

gh api "$api" > "$source"
if [[ -n "$reuse_run_id" ]]; then
  gh api "$api/jobs?filter=latest&per_page=100" > "$source_tests"
  sha=$(node tools/verify_package_proof_source.mjs "$source" "$source_tests" "$runner")
  git fetch --depth=1 origin "$sha"
  git diff --exit-code "$sha" HEAD -- apps crates Cargo.toml Cargo.lock .cargo rust-toolchain rust-toolchain.toml tools/allow_wasm_package.mjs
else
  sha=$(node tools/verify_package_proof_source.mjs "$source")
fi
printf 'sha=%s\n' "$sha" >> "$GITHUB_OUTPUT"
