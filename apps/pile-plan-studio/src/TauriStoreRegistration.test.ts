import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Tauri user settings store registration", () => {
  const tauriRoot = resolve(import.meta.dirname, "../src-tauri");

  it("registers the store dependency, plugin, and capability", () => {
    const cargo = readFileSync(resolve(tauriRoot, "Cargo.toml"), "utf8");
    const main = readFileSync(resolve(tauriRoot, "src/main.rs"), "utf8");
    const capability = readFileSync(resolve(tauriRoot, "capabilities/default.json"), "utf8");

    assert.match(cargo, /tauri-plugin-store\s*=\s*"2"/);
    assert.match(main, /\.plugin\(tauri_plugin_store::Builder::default\(\)\.build\(\)\)/);
    assert.match(capability, /"store:default"/);
  });
});
