# Windows Installer Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure the Windows NSIS installer and uninstaller to use the existing Pile Plan Studio application icon.

**Architecture:** Keep `src-tauri/icons/icon.ico` as the single Windows icon asset and reference it from the generic Tauri bundle plus the NSIS-specific installer and uninstaller settings. Verify the contract through a JSON-based configuration regression test and a real local NSIS build.

**Tech Stack:** Tauri 2 configuration, Node.js test runner, TypeScript, NSIS, PowerShell

## Global Constraints

- Use `apps/pile-plan-studio/src-tauri/icons/icon.ico` as the only Windows icon asset.
- Configure both the NSIS installer and uninstaller explicitly.
- Do not add a custom NSIS template or change the Azure Artifact Signing workflow.
- Keep the implementation targeted at release 0.2.1.

---

### Task 1: Share the application icon with NSIS

**Files:**
- Modify: `apps/pile-plan-studio/src-primary-entry.test.ts`
- Modify: `apps/pile-plan-studio/src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: Tauri `bundle.icon`, `bundle.windows.nsis.installerIcon`, and `bundle.windows.nsis.uninstallerIcon` configuration fields.
- Produces: A validated Tauri bundle configuration in which all Windows bundle surfaces reference `icons/icon.ico`.

- [ ] **Step 1: Write the failing configuration test**

Add a focused test that parses the Tauri JSON rather than matching formatting:

```ts
it("uses the shared Windows icon for the app, installer, and uninstaller", () => {
  const tauriConfig = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "src-tauri/tauri.conf.json"), "utf8"),
  ) as {
    bundle?: {
      icon?: string[];
      windows?: {
        nsis?: {
          installerIcon?: string;
          uninstallerIcon?: string;
        };
      };
    };
  };

  assert.deepEqual(tauriConfig.bundle?.icon, ["icons/icon.ico"]);
  assert.equal(tauriConfig.bundle?.windows?.nsis?.installerIcon, "icons/icon.ico");
  assert.equal(tauriConfig.bundle?.windows?.nsis?.uninstallerIcon, "icons/icon.ico");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from `apps/pile-plan-studio`:

```powershell
node --test src-primary-entry.test.ts
```

Expected: FAIL because `bundle.windows.nsis.installerIcon` and `uninstallerIcon` are absent.

- [ ] **Step 3: Add the minimal NSIS configuration**

Extend `bundle` in `src-tauri/tauri.conf.json`:

```json
"windows": {
  "nsis": {
    "installerIcon": "icons/icon.ico",
    "uninstallerIcon": "icons/icon.ico"
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node --test src-primary-entry.test.ts
```

Expected: all tests in the file PASS with no warnings.

- [ ] **Step 5: Commit the tested configuration**

```powershell
git add apps/pile-plan-studio/src-primary-entry.test.ts apps/pile-plan-studio/src-tauri/tauri.conf.json
git commit -m "fix: brand Windows installer executables"
```

### Task 2: Verify the Windows bundle

**Files:**
- Verify: `apps/pile-plan-studio/src-tauri/icons/icon.ico`
- Verify: `apps/pile-plan-studio/src-tauri/target/release/bundle/nsis/*-setup.exe`

**Interfaces:**
- Consumes: The Tauri configuration from Task 1 and the existing six-resolution ICO asset.
- Produces: Test and build evidence that the generated NSIS bundle uses the shared branding without changing signing behavior.

- [ ] **Step 1: Run the complete frontend test suite**

Run from `apps/pile-plan-studio`:

```powershell
npm test
```

Expected: all frontend tests PASS.

- [ ] **Step 2: Build the production frontend**

Run:

```powershell
npm run build
```

Expected: TypeScript, WASM, and Vite production build complete successfully.

- [ ] **Step 3: Build the unsigned local NSIS installer**

Run:

```powershell
npm run tauri build -- --bundles nsis
```

Expected: the application executable and `*-setup.exe` are created under `src-tauri/target/release` and `src-tauri/target/release/bundle/nsis`.

- [ ] **Step 4: Inspect the produced icon resources**

Use Windows Explorer or the shell icon APIs to inspect the generated installer and application executable at small and normal icon sizes. Open the installer interactively and confirm that its window uses the same logo. If an installation is performed, also confirm that the Start menu shortcut, optional desktop shortcut, and uninstaller use the logo.

Expected: every inspected Windows surface shows the Pile Plan Studio pile-lattice logo, with no generic NSIS or Tauri icon.

- [ ] **Step 5: Confirm the release workflow is unchanged**

Run:

```powershell
git diff main -- .github/workflows/release.yml
```

Expected: no output; signing remains delegated to the tagged release workflow.

- [ ] **Step 6: Check the final branch state**

Run:

```powershell
git status --short --branch
git log --oneline main..HEAD
```

Expected: a clean feature branch containing the design and implementation commits.
