# Browser Deployment

Pile Plan Studio's browser application is a static Vite build. It needs no
application server, database, or native file-system access.

## Build

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
For the current public alpha, build from `v0.1.3-alpha`.

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

The browser build and Windows desktop build use the same Rust calculation core.

## Signed Windows Alpha Release

Push an alpha tag matching `v*-alpha`, for example:

```powershell
git tag v0.1.3-alpha
git push origin v0.1.3-alpha
```

The release workflow runs the Rust and frontend tests, builds the NSIS Windows
installer, signs it through Azure Artifact Signing, and verifies that Windows
recognizes `Impertio Studio B.V.` as its publisher. A failed build, missing
secret, or invalid signature stops the workflow before release creation.

Successful builds are attached to a private draft release. Test the installer
before publishing that draft as a public prerelease.

The repository requires access to these OpenAEC GitHub Actions secrets:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_CERTIFICATE_PROFILE_NAME`

