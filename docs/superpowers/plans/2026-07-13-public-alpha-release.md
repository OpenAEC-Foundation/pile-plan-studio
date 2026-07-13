# Public Alpha Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a tested static browser demo and a signed Windows x64 alpha release of Pile Plan Studio on 14 July 2026.

**Architecture:** Keep the existing React interface and shared Rust core unchanged during the feature freeze. Stabilize the current branch first, then add public alpha identification, user-facing documentation, and a tag-driven Windows release workflow that reuses OpenAEC Azure Trusted Signing. The hosted browser build remains a static Vite artifact.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Rust, WASM, Tauri 2, GitHub Actions, Azure Trusted Signing.

## Global Constraints

- Browser demo is the primary public alpha experience.
- Windows x64 is the only desktop target for `v0.1.0-alpha.1`.
- Add no new domain features before release.
- RFEM import and selected-pile Excel export remain deferred.
- Engineering results require professional verification.
- Tests, type checking, Rust checks, or builds must block a release when they fail.
- Preserve LGPL-3.0-or-later.
- Remove `docs/superpowers/` from the public working tree after durable decisions are copied into public documentation.

---

### Task 1: Stabilize the Current Alpha Branch

**Files:**
- Review: all files reported by `git status --short`
- Test: `apps/pile-plan-studio/src/**/*.test.ts`
- Test: `crates/pile-plan-core/src/**/*.rs`
- Test: `crates/pile-plan-wasm/src/**/*.rs`

**Interfaces:**
- Consumes: current `codex/alpha-command-navigation` working tree.
- Produces: one committed branch state in which persistence, localization, licensing, sidebar resizing, and IFCPP export pass all checks.

- [ ] **Step 1: Inventory the working tree without discarding user changes**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Expected: every changed file is understood; no patch errors.

- [ ] **Step 2: Run frontend and Rust tests**

```powershell
cd apps\pile-plan-studio
npm test
cd ..\..
cargo test --workspace
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run type checking and the browser production build**

```powershell
cd apps\pile-plan-studio
npx tsc -p tsconfig.json --noEmit
npm run build
```

Expected: TypeScript and Vite/WASM builds succeed.

- [ ] **Step 4: Build the Windows desktop application**

```powershell
npm run tauri build
```

Expected: bundles appear under `apps/pile-plan-studio/src-tauri/target/release/bundle/`.

- [ ] **Step 5: Repair only release-blocking failures**

For each failure, add or tighten the smallest relevant regression test, reproduce it, implement the minimal correction, and rerun the failing command. Do not add RFEM import, Excel export, new optimization behavior, or unrelated UI refinements.

- [ ] **Step 6: Commit the stabilized alpha changes**

```powershell
git add LICENSE apps/pile-plan-studio crates
git commit -m "feat: stabilize public alpha workflow"
```

---

### Task 2: Add Honest Public Alpha Identification

**Files:**
- Modify: `apps/pile-plan-studio/src/components/template/TitleBar.tsx`
- Modify: `apps/pile-plan-studio/src/components/template/TitleBar.css`
- Modify: `apps/pile-plan-studio/src/i18n/locales/en/common.json`
- Modify: `apps/pile-plan-studio/src/i18n/locales/nl/common.json`
- Test: `apps/pile-plan-studio/src/components/template/CommandSurface.test.ts`

**Interfaces:**
- Consumes: existing common translation namespace and title bar.
- Produces: a visible localized Alpha badge with an accessible engineering verification notice.

- [ ] **Step 1: Add a failing test for alpha copy**

Add assertions requiring `t("alphaLabel")`, English and Dutch `alphaLabel`, and localized `engineeringDisclaimer` strings.

```ts
assert.match(titleBarSource, /t\("alphaLabel"\)/);
assert.equal(enCommon.alphaLabel, "Alpha");
assert.equal(nlCommon.alphaLabel, "Alpha");
assert.match(enCommon.engineeringDisclaimer, /professional verification/i);
assert.match(nlCommon.engineeringDisclaimer, /deskundige/);
```

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
node --test src/components/template/CommandSurface.test.ts
```

Expected: FAIL because the new translation keys are absent.

- [ ] **Step 3: Add localized strings**

English:

```json
"alphaLabel": "Alpha",
"engineeringDisclaimer": "Engineering results require professional verification."
```

Dutch:

```json
"alphaLabel": "Alpha",
"engineeringDisclaimer": "Technische resultaten moeten door een deskundige worden gecontroleerd."
```

- [ ] **Step 4: Render a compact badge**

Place beside the application name:

```tsx
<span
  className="titlebar-alpha-badge"
  title={t("engineeringDisclaimer")}
  aria-label={`${t("alphaLabel")}: ${t("engineeringDisclaimer")}`}
>
  {t("alphaLabel")}
</span>
```

Style it with existing theme variables. Do not add a modal or startup obstruction.

- [ ] **Step 5: Verify and commit**

```powershell
node --test src/components/template/CommandSurface.test.ts
npm test
git add src/components/template/TitleBar.tsx src/components/template/TitleBar.css src/i18n src/components/template/CommandSurface.test.ts
git commit -m "feat: identify public alpha build"
```

---

### Task 3: Create Public Documentation and Deployment Handoff

**Files:**
- Modify: `README.md`
- Create: `docs/known-limitations.md`
- Create: `docs/openaec-product-page.md`
- Create: `docs/deployment.md`
- Modify: `docs/alpha-design.md`

**Interfaces:**
- Consumes: supported application behavior and production output at `apps/pile-plan-studio/dist/`.
- Produces: public entry point, hosting handoff, limitations, and reusable product copy.

- [ ] **Step 1: Rewrite README with these sections**

```markdown
# Pile Plan Studio
## Alpha Status
## What You Can Do
## Try or Install
## Supported Project Data
## Known Limitations
## Architecture
## Development
## Contributing
## License
```

State that the browser demo is primary, results require professional verification, IFCPP is evolving, and RFEM import plus Excel export are planned.

- [ ] **Step 2: Document concrete alpha limitations**

Include: no formal engineering certification; configurable CPT approximation; greedy optimizer is not globally optimal; IFCPP can change during alpha; Windows x64 is the only desktop package; RFEM import and selected-pile Excel export are absent.

- [ ] **Step 3: Document static hosting**

Use:

```powershell
cd apps\pile-plan-studio
npm ci
npm run build
```

Document that `dist/` is served over HTTPS, `.wasm` uses `application/wasm`, and unknown routes fall back to `index.html`.

- [ ] **Step 4: Add Dutch and English OpenAEC product-page copy**

Include purpose, alpha status, browser demo, Windows download, Rust/WASM/Tauri/React architecture, and disclaimer. Exclude unfinished features.

- [ ] **Step 5: Update public alpha status and verify claims**

```powershell
rg -n "MIT|version 2|index\.react|dev:react|RFEM.*supported|Excel export.*supported" README.md docs
```

Expected: no obsolete public claims.

- [ ] **Step 6: Commit public documentation**

```powershell
git add README.md docs/alpha-design.md docs/known-limitations.md docs/openaec-product-page.md docs/deployment.md
git commit -m "docs: prepare public alpha documentation"
```

---

### Task 4: Add Blocking CI and Signed Windows Release

**Files:**
- Create: `.github/workflows/check.yml`
- Create: `.github/workflows/release.yml`
- Modify: `apps/pile-plan-studio/src-tauri/tauri.conf.json`
- Modify: `apps/pile-plan-studio/package.json`
- Modify: `apps/pile-plan-studio/src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: npm `test` and `build`, Cargo workspace tests, Tauri, and OpenAEC Trusted Signing secrets.
- Produces: blocking checks and draft signed Windows releases for `v*` tags.

- [ ] **Step 1: Align version metadata**

Use `0.1.0-alpha.1` where prerelease versions are accepted. If Windows bundle metadata rejects it, retain bundle version `0.1.0` and use the prerelease tag and release name externally.

- [ ] **Step 2: Add a blocking check workflow**

Create `check.yml` using checkout v4, Node 22, stable Rust, `npm ci`, `npm test`, `cargo test --workspace`, and `npm run build`. Never append `|| true`.

- [ ] **Step 3: Add the tag-driven Windows workflow**

Build on `windows-latest` with `tauri-apps/tauri-action@v0`. Sign application EXE, NSIS EXE, and MSI with `azure/trusted-signing-action@v0` using:

```yaml
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_ENDPOINT
AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
AZURE_CERTIFICATE_PROFILE_NAME
```

Publish via `softprops/action-gh-release@v2` with `draft: true` and `prerelease: true`.

- [ ] **Step 4: Validate workflows**

```powershell
git diff --check -- .github/workflows
rg -n "\|\| true|continue-on-error: true" .github/workflows
```

Expected: valid YAML and no suppressed failures.

- [ ] **Step 5: Confirm organization-secret access**

An OpenAEC administrator grants this repository access to all six signing secrets. Never copy values into files or logs.

- [ ] **Step 6: Commit automation**

```powershell
git add .github/workflows apps/pile-plan-studio/package.json apps/pile-plan-studio/package-lock.json apps/pile-plan-studio/src-tauri/Cargo.toml apps/pile-plan-studio/src-tauri/Cargo.lock apps/pile-plan-studio/src-tauri/tauri.conf.json
git commit -m "ci: add signed Windows alpha release"
```

---

### Task 5: Execute Manual Source Smoke Tests

**Files:**
- Temporary only: `release-smoke-test.md`
- Exercise: embedded sample project
- Exercise privately: `C:\Users\DevAEC\Dropbox\Samen\SamenRevitTemplate\LIS Gebouw`

**Interfaces:**
- Consumes: browser and Tauri builds from Tasks 1-4.
- Produces: source-gate evidence without committing private LIS paths or data.

- [ ] **Step 1: Start a production-like browser preview**

```powershell
cd apps\pile-plan-studio
npm run build
npx vite preview --host 127.0.0.1
```

- [ ] **Step 2: Test sample project in Chrome and Edge**

Verify startup, analysis completion, pan/zoom, load-point and CPT selection, manual pile assignment, optimization, IFCPP download, and reopening.

- [ ] **Step 3: Test LIS import**

Import the three sources, verify analysis finishes rather than hangs, inspect warnings, change a pile and CPT selection, save/download IFCPP, and reopen it.

- [ ] **Step 4: Test Tauri**

Verify native open, save, save-as, reopening, and unsaved-change protection.

- [ ] **Step 5: Handle results**

Add regression tests for blockers. Put non-blocking observations in `docs/known-limitations.md`. Remove temporary notes and verify no private paths are staged:

```powershell
git diff --cached | Select-String -Pattern "Dropbox|LIS Gebouw"
```

Expected: no matches.

---

### Task 6: Remove Internal Planning Files

**Files:**
- Modify: `.gitignore`
- Review: `README.md`, `docs/architecture.md`, `docs/alpha-design.md`
- Remove: `docs/superpowers/`

**Interfaces:**
- Consumes: durable decisions from completed internal documents.
- Produces: clean public docs while retaining planning history in Git history.

- [ ] **Step 1: Confirm durable decisions exist in public docs**

Verify architecture, alpha scope, deployment, limitations, release gates, and licensing are represented publicly.

- [ ] **Step 2: Ignore future internal plans**

Append:

```gitignore
docs/superpowers/
```

- [ ] **Step 3: Remove tracked planning files without rewriting history**

Remove `docs/superpowers/` from the current revision using Git.

- [ ] **Step 4: Verify and commit**

```powershell
git ls-files docs/superpowers
Get-ChildItem docs -File | Select-Object -ExpandProperty Name
git add .gitignore docs
git commit -m "chore: remove internal planning documents"
```

Expected: no tracked internal planning files; public docs remain.

---

### Task 7: Merge, Tag, and Verify Artifacts

**Files:**
- Generated locally: `apps/pile-plan-studio/dist/`
- Generated remotely: draft Windows installers.

**Interfaces:**
- Consumes: verified branch and enabled signing secrets.
- Produces: public `main`, browser artifact, `v0.1.0-alpha.1`, and verified draft release.

- [ ] **Step 1: Run the complete source gate**

```powershell
cargo test --workspace
cd apps\pile-plan-studio
npm test
npx tsc -p tsconfig.json --noEmit
npm run build
cd ..\..
git diff --check
```

Expected: every command succeeds.

- [ ] **Step 2: Merge and push**

Use a normal non-interactive merge. Confirm the remote is `OpenAEC-Foundation/pile-plan-studio`. Never force-push.

- [ ] **Step 3: Hand off browser deployment**

Provide exact commit SHA, build command, `dist/` location, and `docs/deployment.md`. Hosting should build from the tagged commit.

- [ ] **Step 4: Tag and push**

```powershell
git tag -a v0.1.0-alpha.1 -m "Pile Plan Studio v0.1.0-alpha.1"
git push origin v0.1.0-alpha.1
```

- [ ] **Step 5: Monitor release workflow**

```powershell
gh run list --repo OpenAEC-Foundation/pile-plan-studio --limit 5
gh run watch --repo OpenAEC-Foundation/pile-plan-studio
```

Expected: checks, Windows build, signing, artifact upload, and draft release succeed.

- [ ] **Step 6: Execute artifact gate**

Test deployed browser in Chrome and Edge. Verify Windows Authenticode signature on a clean environment, install, and repeat open/save/reopen tests.

- [ ] **Step 7: Publish**

Publish only after verification, retain prerelease status, and confirm README links before the OpenAEC announcement.

