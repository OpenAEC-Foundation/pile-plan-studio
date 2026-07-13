import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
    assert.doesNotMatch(indexHtml, /src="\/src\/main\.ts"/);
    assert.doesNotMatch(viteConfig, /index\.react\.html|vanilla:|react:/);
    assert.doesNotMatch(packageJson, /dev:react|build:react/);
    assert.match(tauriConfig, /"beforeDevCommand": "npm run dev"/);
    assert.match(tauriConfig, /"beforeBuildCommand": "npm run build"/);
    assert.match(packageJson, /allow_wasm_package\.mjs src\/core\/wasm\/pile-plan-wasm/);
    assert.match(wasmPackageHelper, /process\.argv\[2\]/);
  });
});
