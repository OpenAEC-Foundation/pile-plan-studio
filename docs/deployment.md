# Build and Deployment

Open Pile Plan Studio's browser application is a static Vite build. It needs no
application server, database, or native file-system access.

## Development prerequisites

Use a current Node.js 22 or 24 release (CI uses 22), stable Rust, `wasm-pack`,
and the `wasm32-unknown-unknown` Rust target. The npm build and development
scripts regenerate the browser core; do not edit generated WASM files manually.

Native Rust tests and Tauri builds compile HiGHS and require a C++ toolchain,
CMake on `PATH`, and libclang for bindgen. On Windows, use the MSVC C++ build
tools and set `LIBCLANG_PATH` to the directory containing `libclang.dll` if it
is not discovered automatically. If CMake selects an unavailable Visual Studio
version, set `CMAKE_GENERATOR` to the installed generator, for example
`Visual Studio 17 2022`. These are build-time dependencies; desktop users do not
need to install HiGHS separately.

The Tauri crate is outside the root Rust workspace. From the repository root,
verify both independently:

```powershell
cargo test --workspace
$env:CARGO_TARGET_DIR = Join-Path $PWD 'target'
cargo test --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml
```

A short target directory helps avoid Windows MSBuild path limits. The repository
root `target` directory works for typical checkouts; use a shorter absolute
path if needed. This override also moves locally built installers beneath that
target directory. CI uses the default Tauri target path shown in the workflow.

## Browser build

From the repository root:

```powershell
cd apps\pile-plan-studio
npm ci
npm run build
```

The deployable files are written to:

```text
apps/pile-plan-studio/dist/
```

Deploy the complete contents of this directory from one commit or release tag.
For the current public alpha source, use release tag `v2026.43.1`.
This includes the Rust core WASM, HiGHS WASM and Worker assets; the browser solver
does not load its executable code from a CDN.

The [site workflow](../.github/workflows/live.yml) builds and deploys on every
push to `main`, or through manual workflow dispatch. Browser publication is
independent of the Windows release tag and draft publication.

The [OpenAEC product page](https://open-aec.com/open-pile-plan-studio/) is
maintained in the separate `OpenAEC-Foundation/website` repository. Its download
block links directly to a published Windows installer asset, while its release
notes come from that website's generated release data. Publishing an app build
or release does not itself update the product page: let the website data update
and deploy, then verify the displayed version, direct installer link, and release
notes on the live page. If changing shared website CSS or JavaScript with
long-lived caching, version the asset URL in every affected language page; the
download anchor must leave its title visible below the sticky navigation.

## Hosting Requirements

- Serve the application over HTTPS.
- Serve `.wasm` files as `application/wasm`.
- Preserve hashed files below `/assets/`.
- Return `index.html` for unknown application navigation routes.
- Do not cache `index.html` indefinitely; hashed assets may use long-lived
  immutable caching.
- Do not add cross-origin isolation headers unless the hosting platform has been
  tested with file import and download.

## Verification

After deployment, test in current Chrome and Edge:

1. The sample project opens and pile-option analysis completes.
2. Pan, zoom, click selection, Shift+click, and Shift+drag work.
3. A CSV/XLSX project import completes.
4. IFCPP download opens a save prompt and produces a project that can be
   reopened.
5. The WASM request returns successfully with no console or MIME errors.
6. Optimization starts its HiGHS Worker, updates the best-found plan, and
   supports stop-and-use-best and cancel without corrupting the project.

The browser build and Windows desktop build use the same Rust calculation core.

## Release versions and preparation

The app `package.json` is the source of the product version and release metadata:
`version`, `release.channel` and `release.date`. The channel is currently `alpha`;
the frontend displays **Alpha** independently of the numeric version. GitHub
release titles include **— Alpha** and releases are marked as prereleases.
Changing product maturity is a separate decision from choosing a date version.

New releases use `YYYY.W.N` and tags use `vYYYY.W.N`, without an alpha suffix or
leading zeros. `YYYY` is the ISO week-numbering year, `W` the ISO week and `N` a
sequence starting at zero for each week. For example, 1 January 2027 belongs to
2026 week 53, while 4 January belongs to 2027 week 1. No next release week is
fixed in advance. Existing published tags remain unchanged. The legacy `0.x.y`
development version remains buildable until an actual release is prepared;
it cannot pass the new release gate and its release date must be `null`.

From `apps/pile-plan-studio`, preview preparation, then prepare when the release
date and source contents have been chosen:

```powershell
npm run release:prepare -- --dry-run
npm run release:prepare
```

The default date is today's date in `Europe/Amsterdam`. For a reproducible,
explicit input, use `--date YYYY-MM-DD` with the chosen actual release date.
Preparation reads local and current remote tags and chooses the highest numeric
sequence for that ISO week plus one, or zero if none exists. All release channels
share that sequence. A remote read failure stops preparation before any write.
A tag, including one whose build failed, reserves its number. Build retries on
the same tag use the same source commit and version.

Preparation synchronizes npm, all three Rust crate manifests, and Tauri config;
refreshes the npm and both Cargo lockfiles; and regenerates WASM with the existing
`npm run build:wasm` script. Install the prerequisites and run `npm ci` first.
Only the product package versions may change in the lockfiles: dependency
upgrades are rejected. An ignored `.release-preparation.json` marker retains the
dependency baseline if a generator fails. The normal consistency check rejects
an incomplete preparation. Resolve the reported cause and rerun with the same
date; do not bypass the check by deleting the marker. Inspect the resulting diff.

```powershell
npm run release:check
npm run release:check -- --release --publish --available
```

The first command checks all source versions, lock records and generated WASM
package metadata without network access or dependence on today's date. Tests
and browser builds include this check. The second command additionally requires
the new release format, checks the current Amsterdam publication week and verifies
that the intended tag is still unused locally and remotely. Run it immediately
before tagging; if another release used that number, prepare again. Preparation
does not reserve a remote number or create any Git refs.

## Windows release build and proof

Windows packaging explicitly uses NSIS both locally and in CI. A local build is:

```powershell
npm run tauri build -- --bundles nsis
```

MSI requires a separately designed version mapping: its major version cannot
exceed 255, so the year cannot be used directly. macOS and Linux packaging are
separate work. See the [Tauri configuration reference](https://v2.tauri.app/reference/config/#wixconfig).

Before tagging, run the Rust and separate Tauri tests above, then `npm test` and
`npm run build`. Check both About views in the browser and desktop. Verify the
actual running executable path and product version. Prepare release notes and
update current-release references such as the README badge at release time.

The [release workflow](../.github/workflows/release.yml) has two routes:

- A new `vYYYY.W.N` tag validates the prepared commit, runs tests, builds NSIS,
  signs the app, NSIS uninstaller and installer through Azure Artifact Signing,
  verifies their publisher and timestamps, installs and
  launches the app, then creates a draft GitHub prerelease. Version/tag
  mismatches fail before building; generated package versions are checked again
  after the build.
- Manual dispatch takes a `release_tag` in the same format and checks it against
  the selected prepared source. By default it builds an **unsigned proof** and performs the
  version, installation, executable-path and launch checks on the disposable
  runner. It uploads a workflow artifact, skips signing and never creates a
  GitHub release. This does not prove the signing route.
- Manual dispatch with `sign_proof=true` explicitly enables a **signed proof**
  using the existing Azure identity. It checks all three signatures on the
  installed files and uploads the installer, app, uninstaller and JSON signature
  report as a workflow artifact. It never creates a tag, draft or GitHub release.

Packaging first builds the app without bundling. The Azure action signs that
binary and installs its supported signing tools. Tauri then bundles with a
temporary `bundle.windows.signCommand` configuration, re-signing the app after
patching its bundle metadata and signing the NSIS uninstaller and installer.
Signing metadata stays under `RUNNER_TEMP`; credentials are passed through the
environment and are not written into the configuration. Ordinary local builds
and default unsigned proofs need no signing credentials.

For an explicitly authorized signed test on a feature branch, without publishing:

```powershell
$signingInfo = node tools/release.mjs info | ConvertFrom-Json
$signingBranch = git branch --show-current
gh workflow run release.yml --ref $signingBranch -f "release_tag=$($signingInfo.tag)" -f sign_proof=true
```

Use the tag-format value matching the tested branch's prepared source version;
this input validates the version and does not create or move that tag. Inspect
the workflow summary and `signatures.json`, including the installed app and
uninstaller. Signature and silent-install tests do not reproduce SmartScreen
reputation checks after an ordinary browser download.

Manual dispatch is available once the workflow exists on the default branch.
Local route/validator tests do not prove that GitHub actually received a tag
push. An actual CI proof requires a separately authorized push/run; do not push
to `main` merely to enable it, because that also deploys the browser application.

## Tagging and publication

Only tag, push or publish when requested. Use a reviewed source commit with a
clean working tree; integration into `main` is a separate decision. From the
repository root, obtain the centrally defined tag:

```powershell
$releaseInfo = node tools/release.mjs info | ConvertFrom-Json
$releaseTag = $releaseInfo.tag
node tools/release.mjs check --release --publish --available
git tag -a $releaseTag -m "Open Pile Plan Studio $releaseTag"
git push origin $releaseTag
```

Never reuse or move an existing release tag. Check the workflow summary and
downloaded installer's product version, Authenticode publisher and SHA-256 hash.
The runner checks installation and startup; manually check relevant native
interactions as well. Replace generated notes with the prepared release notes.
Immediately before publishing, from the exact tagged source, run:

```powershell
node tools/release.mjs check --tag $releaseTag --publish
gh release edit $releaseTag --notes-file target/release-notes.md --prerelease --draft=false
```

If publication has moved to another ISO week, prepare a new version, build and
tag. Leave the old tag unchanged and the old draft unpublished. Historical
consistency checks and rebuilds deliberately do not check today's week.

Finally verify the public release and signed download. Browser deployment and
the product website/download links are independent publication steps described
above; a successful Windows release does not establish that they are updated.

The repository requires access to these OpenAEC GitHub Actions secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_CERTIFICATE_PROFILE_NAME`

