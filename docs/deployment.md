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
For the first public alpha, build from `v0.1.0-alpha.1`.

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

