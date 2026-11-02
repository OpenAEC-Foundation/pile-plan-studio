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
For the 2026.45.1 alpha source, use release tag `v2026.45.1` once published.
This includes the Rust core WASM, HiGHS WASM and Worker assets; the browser solver
does not load its executable code from a CDN.

The [site workflow](../.github/workflows/live.yml) builds and deploys on every
push to `main`, or through manual workflow dispatch. Browser publication is
independent of the desktop release tag and draft publication.

The [OpenAEC product page](https://open-aec.com/open-pile-plan-studio/) is
maintained in the separate `OpenAEC-Foundation/website` repository. Its download
block selects actual published Windows/macOS/Linux assets, while its release
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
exceed 255, so the year cannot be used directly. macOS uses a universal DMG;
Linux uses deb and AppImage. See the [Tauri configuration reference](https://v2.tauri.app/reference/config/#wixconfig).

Before tagging, run the Rust and separate Tauri tests above, then `npm test` and
`npm run build`. Check both About views in the browser and desktop. Verify the
actual running executable path and product version. Prepare release notes and
update current-release references such as the README badge at release time.

The [release workflow](../.github/workflows/release.yml) has two routes:

- A new `vYYYY.W.N` tag validates the prepared commit and builds all three desktop
  platforms. Windows uses Azure signing for the app, NSIS uninstaller and
  installer; Linux signs its downloads with OpenPGP; macOS signs/notarizes/staples
  a universal app and DMG. Native tests and package checks run before the signed
  Linux/macOS GUI scenarios. Only after every build and runtime job succeeds
  does the final job assemble a draft GitHub prerelease. Version/tag mismatches
  fail before building; package versions are checked again after the build.
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

## Linux and macOS packages and proof builds

Manual dispatch of the existing `release.yml` accepts `proof_platform`:
`windows` (default), `linux`, `macos`, or `all`. Tag releases always build all
platforms; manual dispatches retain their selected proof platforms.
Push and workflow execution require separate authorization.
Independent platform selections use separate workflow concurrency groups, so a
Linux proof does not hold a macOS proof in the queue.

A signed macOS dispatch may set `macos_proof_run_id` to recheck an existing DMG
after a change to verification tools, without rebuilding or notarizing it.
The source must be a dispatch of this workflow in the same repository and branch.
CI fetches its source commit and requires identical `apps/`, `crates/` and root
Cargo manifests/lockfile before downloading the artifact named for that commit.
For an existing package, CI requires the source run's native workspace, Tauri and
frontend tests to have completed successfully on the same architecture. It runs
the current verifier tests and repeats all package signing/startup gates. The
report records the source tests and package commit separately from the verifier.
Fresh builds continue to run the complete native/frontend suites.
Tag releases and unsigned or other-platform proofs cannot use this input.

Linux builds AppImage and Debian packages on Ubuntu 22.04 x64; runtime jobs
install the Debian package and launch both formats on Ubuntu 22.04 and 24.04.
AppImage uses its normal FUSE route. macOS builds a universal Apple Silicon/Intel
DMG with a configured minimum of macOS 15.0, then inspects and launches the same
DMG on native `macos-15` and `macos-15-intel` runners. Both Mac architectures
also run the native Rust/Tauri and frontend tests. Linux and macOS retain native
HiGHS; they do not substitute a different solver.

`sign_proof=false` produces unsigned proofs. `sign_proof=true` requires existing
organization credentials and fails if they are unavailable. macOS reuses
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_API_KEY_CONTENT`, `APPLE_API_KEY`, and `APPLE_API_ISSUER`. The certificate
and temporary keychain are removed in an always-run cleanup step. Both the app
and the DMG require Developer ID signing, notarization and stapled tickets.
Linux reuses secrets `OPENAEC_GPG_PRIVATE_KEY`, `OPENAEC_GPG_PASSPHRASE` and
variable `OPENAEC_GPG_FINGERPRINT`. It signs the AppImage, Debian package and
`SHA256SUMS`, exports the public key and checks the signatures again in a fresh
public keyring. Compare the full fingerprint with the organization's trusted
source before importing a downloaded public key. These are download signatures;
they do not configure apt repository trust or the Tauri updater.

Proof artifacts contain package metadata, dependencies, source SHA, version and
process paths. Their `interactive-acceptance.txt` explicitly records GUI checks
as **NOT RUN**: a surviving process does not prove webview readiness. Before
claiming platform support, verify native open/save/save-as, Unicode paths,
CSV/XLSX import/export, IFCPP reopening, the shared native/browser ILP fixture,
optimization stop/cancel/apply and undo, plus session-gated MCP access on each
OS. Check Finder/open-with both cold and with the app already running. Test
additional distributions or older macOS releases before making compatibility claims.

Automated proof results verified on 2 November 2026:

- [Linux signed proof](https://github.com/OpenAEC-Foundation/pile-plan-studio/actions/runs/41428425085):
  AppImage and Debian package signed with the existing OpenAEC GPG signing subkey;
  both formats started on Ubuntu 22.04 and 24.04 x64. Downloaded checksums and
  detached signatures were independently verified against the known organization
  fingerprint `13F6D414ADEE4ED4CD09AC60601D86C93C504D29`.
- [macOS package verification](https://github.com/OpenAEC-Foundation/pile-plan-studio/actions/runs/41436989346):
  the same universal DMG was verified and started on macOS 15.8.2 arm64 and
  macOS 15.7.9 Intel. Both the app and DMG passed Developer ID/Gatekeeper and
  stapled-ticket checks. The [source build and notarization job](https://github.com/OpenAEC-Foundation/pile-plan-studio/actions/runs/41431616378/job/125231363662)
  produced that DMG; the verification run records its source commit and reuses
  successful native/frontend tests only after confirming identical application
  source. The DMG SHA-256 is
  `c0f353db601300ff2df4b3a852433c4051842d6e4e87390141739e1c3ae43731`.

Apple ticket delivery briefly lost its CloudKit connection during these proofs.
The helpers retry ticket stapling/validation at most three times for delivery
errors 65/68; other errors and exhausted attempts still fail. Rejected notarization
is never accepted by this retry path.

These remain workflow proof artifacts. GUI acceptance is recorded separately
below; public Linux/macOS downloads remain pending. No release is created by dispatch.
Release integration, a new version/tag, public download links and the separate
product website remain subsequent work after reviewing platform evidence.

### Packaged desktop acceptance

The Linux/macOS runtime jobs in `.github/workflows/release.yml` exercise signed packages
through the operating system's accessibility APIs, with native keyboard and
pointer input. The controller is external to the application: the delivered
app has no test plugin, test HTTP listener or modified signature. The runtime
jobs have read-only repository/Actions permissions. A separate final job has
permission to assemble an unpublished draft after all checks succeed.

The four scenarios cover the rendered drawing and desktop scale; native
open/save/save-as/cancel/overwrite/reopen with Unicode and space-containing
paths; CSV/XLSX export with source-data checks; installed OS file association
both cold and warm; and an ILP run through the interface, visible progress,
cancellation without persisting previews, a committed new plan and one-step
undo. The 328-point sample is software-test data; its fictional tension advice
is not foundation design guidance.

Linux runs deb and normal FUSE AppImage scenarios separately on Ubuntu 22.04
and 24.04 x64. Debian installs the IFCPP MIME definition and desktop entry with
file-argument forwarding. A portable AppImage does not install host-wide file
associations; its corresponding scenario checks cold/warm file arguments.
Linux file-type checks use GIO, matching the tested graphical file opener;
headless `xdg-mime query filetype` reported generic JSON on these runners while
GIO recognized the installed IFCPP type. macOS runs the
same signed universal DMG on both ARM and Intel runners.

Each acceptance artifact includes `results.json`, screenshots, accessible UI
trees, actual executable path/version/OS/source evidence, and IFCPP snapshots
before and after cancellation, optimization and undo. Review screenshots as
well as assertions. A startup helper's `interactive-acceptance.txt` describes
only that helper; the separate scenario report records GUI acceptance.
See `tools/desktop-acceptance/README.md` for controller setup and coverage.
MCP client acceptance remains separate under issue #48; these four desktop
scenarios concern issue #47 and do not complete its publication work.

The Linux acceptance checks exposed a missing file association in the first
proof package. The corrected [Linux build/signing job](https://github.com/OpenAEC-Foundation/pile-plan-studio/actions/runs/41445723226/job/125278295151)
adds the MIME definition and file forwarding in the desktop entry. Native
workspace, Tauri and frontend tests passed before packaging. The new deb and
AppImage checksums and all three detached GPG signatures were independently
verified against the organization fingerprint above. The revised SHA-256 values
are `24a3918307340958c6dce7ff6dff553502cc036da1abc5177336168a8df09354`
(deb) and `8be834c555b0cb570b96b823dccbaceb2c9897bbc1ed8fc4e1a51e854b11a99f`
(AppImage). The macOS DMG is unchanged from the notarized source proof above.

The [final packaged GUI acceptance run](https://github.com/OpenAEC-Foundation/pile-plan-studio/actions/runs/41452190108)
passed all four scenarios in each of these six configurations on 2 November 2026:

| System | Delivered package | Result |
| --- | --- | --- |
| Ubuntu 22.04 x64 | deb | 4 / 4 passed |
| Ubuntu 22.04 x64 | AppImage, normal FUSE launch | 4 / 4 passed |
| Ubuntu 24.04 x64 | deb | 4 / 4 passed |
| Ubuntu 24.04 x64 | AppImage, normal FUSE launch | 4 / 4 passed |
| macOS 15.8.2 ARM | universal DMG/app | 4 / 4 passed |
| macOS 15.7.9 Intel | same universal DMG/app | 4 / 4 passed |

The downloaded GUI evidence was also checked independently: cancellation and
one undo restore the entire persisted project content, and all six platform /
package combinations return 303 optimized locations and a cost of EUR 207,941 for
the same sample. Screenshots show the drawing, native dialogs, solver result
and the correct project after a warm file-open request. This records the agreed
four-scenario acceptance for the tested OS versions. Public downloads remain pending.

## Tagging and publication

Tag builds now collect one Windows installer, one universal macOS DMG and two
Linux packages from the same source commit. Producer filenames are normalized
before Linux signing so GitHub download names match the signed checksum file.
The final job preserves that file and signature as `SHA256SUMS-linux` and
`SHA256SUMS-linux.asc`; `SHA256SUMS` covers all four installers. The draft also
contains detached Linux package signatures, its public key/fingerprint and
`release-manifest.json` recording package digests, source commit and build run.

Draft assembly refuses a published/non-alpha release and never replaces an
existing asset. A retry skips identical assets and uploads only missing files;
a different digest stops the job. Retry failed jobs from the same tag/run;
do not move a tag or replace published files. Manual proof dispatches never
reach this draft-creation job. Publishing the GitHub draft, integrating into
`main` (which deploys the browser), and deploying the separate product website
remain explicit release actions.

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

