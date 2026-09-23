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
For the current public alpha source, use release version `0.4.1-alpha`.
This includes the Rust core WASM, HiGHS WASM and Worker assets; the browser solver
does not load its executable code from a CDN.

The [site workflow](../.github/workflows/live.yml) builds and deploys on every
push to `main`, or through manual workflow dispatch. Browser publication is
independent of the Windows release tag and draft publication.

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

## Signed Windows Alpha Release

Before tagging, update the release version consistently in both Rust crate
manifests, the app `package.json`, the Tauri manifest and `tauri.conf.json`.
Refresh the corresponding Cargo/npm lockfiles and regenerate the WASM package
through `npm run build`. Update the version expectation in `productInfo.test.ts`,
the README badge, release notes, and the release reference in this guide.

Run the Rust and separate Tauri tests above, then `npm test` and `npm run build`
from `apps/pile-plan-studio`. Perform the relevant desktop smoke checks as well,
especially for changes to native file opening, windows, or installer integration.
Merge the verified changes to `main` and confirm the intended commit and a clean
working tree before tagging. Only publish when the user has requested a release.

Push an annotated alpha tag matching `v*-alpha`. Set the version to the prepared
release; never move an already published release tag:

```powershell
$releaseVersion = 'X.Y.Z' # Replace with the prepared application version.
$releaseTag = "v$releaseVersion-alpha"
git tag -a $releaseTag -m "Open Pile Plan Studio $releaseTag"
git push origin $releaseTag
```

The release workflow runs the Rust and frontend tests, builds the NSIS Windows
installer, signs it through Azure Artifact Signing, and verifies that Windows
recognizes `Impertio Studio B.V.` as its publisher. A failed build, missing
secret, or invalid signature stops the workflow before release creation.

Successful builds are attached to a draft release. Download the installer and
verify its product version, Authenticode signature/publisher, and SHA-256 hash.
Test installation and launch in a suitable Windows test environment before
publishing that draft as a public prerelease. Signature and version checks do
not replace an installation/launch test; record which checks were performed.

Replace generated notes with the prepared release notes, then publish the draft
(the example assumes GitHub CLI and a notes file containing only this release):

```powershell
gh release edit $releaseTag --notes-file target/release-notes.md --prerelease --draft=false
```

Finally verify the public release page and downloadable signed asset, and check
that the independent site workflow succeeded. The application version is
`X.Y.Z`; the public alpha tag includes the `v` prefix and `-alpha` suffix.

The repository requires access to these OpenAEC GitHub Actions secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_CERTIFICATE_PROFILE_NAME`

