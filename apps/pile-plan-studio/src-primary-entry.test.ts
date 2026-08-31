import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("primary frontend entry", () => {
  it("uses React as the only Vite and Tauri frontend", () => {
    const root = import.meta.dirname;
    const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");
    const packageJson = readFileSync(resolve(root, "package.json"), "utf8");
    const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const tauriConfig = readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8");
    const wasmPackageHelper = readFileSync(resolve(root, "../../tools/allow_wasm_package.mjs"), "utf8");

    assert.match(indexHtml, /src="\/src\/main\.tsx"/);
    assert.match(indexHtml, /<link rel="icon" type="image\/svg\+xml" href="\/pile-plan-studio-icon\.svg"\s*\/>/);
    assert.doesNotMatch(indexHtml, /src="\/src\/main\.ts"/);
    assert.doesNotMatch(viteConfig, /index\.react\.html|vanilla:|react:/);
    assert.doesNotMatch(packageJson, /dev:react|build:react/);
    assert.match(tauriConfig, /"beforeDevCommand": "npm run dev"/);
    assert.match(tauriConfig, /"beforeBuildCommand": "npm run build"/);
    assert.match(packageJson, /allow_wasm_package\.mjs src\/core\/wasm\/pile-plan-wasm/);
    assert.match(wasmPackageHelper, /process\.argv\[2\]/);
  });

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

  it("allows the desktop app to open project file dialogs", () => {
    const capabilityPath = resolve(import.meta.dirname, "src-tauri/capabilities/default.json");

    assert.equal(existsSync(capabilityPath), true, "desktop capability file is missing");
    const capability = JSON.parse(readFileSync(capabilityPath, "utf8")) as {
      windows?: string[];
      permissions?: string[];
    };
    assert.ok(capability.windows?.includes("main"));
    assert.ok(capability.permissions?.includes("dialog:default"));
  });

  it("hides the Windows terminal only in production builds", () => {
    const tauriMain = readFileSync(resolve(import.meta.dirname, "src-tauri/src/main.rs"), "utf8");

    assert.match(
      tauriMain,
      /#!\[cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)\]/,
    );
  });
});
