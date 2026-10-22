import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshCargoLocks, run } from './release-project.mjs';

test('Cargo refresh updates both workspaces, including Tauri core dependency, without compiling', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pile-release-cargo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packages = [
    ['crates/pile-plan-core', 'pile-plan-core', ''],
    ['crates/pile-plan-wasm', 'pile-plan-wasm', '[dependencies]\npile-plan-core = { path = "../pile-plan-core" }\n'],
    ['apps/pile-plan-studio/src-tauri', 'pile-plan-studio', '[workspace]\n[dependencies]\npile-plan-core = { path = "../../../crates/pile-plan-core" }\n'],
  ];
  writeFileSync(join(root, 'Cargo.toml'), '[workspace]\nmembers = ["crates/pile-plan-core", "crates/pile-plan-wasm"]\nexclude = ["apps/pile-plan-studio/src-tauri"]\nresolver = "2"\n');
  for (const [path, name, extra] of packages) {
    mkdirSync(join(root, path, 'src'), { recursive: true });
    writeFileSync(join(root, path, 'src/lib.rs'), '');
    writeFileSync(join(root, path, 'Cargo.toml'), `[package]\nname = "${name}"\nversion = "0.4.3"\nedition = "2021"\n${extra}`);
  }
  run('cargo', ['generate-lockfile', '--offline'], root, { capture: true });
  run('cargo', ['generate-lockfile', '--offline', '--manifest-path', 'apps/pile-plan-studio/src-tauri/Cargo.toml'], root, { capture: true });
  for (const [path] of packages) {
    const file = join(root, path, 'Cargo.toml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('version = "0.4.3"', 'version = "2026.43.0"'));
  }
  refreshCargoLocks(root);
  for (const [path, names] of [['Cargo.lock', ['pile-plan-core', 'pile-plan-wasm']],
    ['apps/pile-plan-studio/src-tauri/Cargo.lock', ['pile-plan-core', 'pile-plan-studio']]]) {
    const lock = readFileSync(join(root, path), 'utf8');
    for (const name of names) assert.ok(lock.includes(`name = "${name}"\nversion = "2026.43.0"`), `${path}: ${name}`);
  }
});
