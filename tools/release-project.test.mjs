import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as project from './release-project.mjs';
import { main } from './release.mjs';

const repo = resolve(import.meta.dirname, '..');
const sourceFiles = [
  'apps/pile-plan-studio/package.json', 'apps/pile-plan-studio/package-lock.json',
  'apps/pile-plan-studio/src-tauri/tauri.conf.json', 'apps/pile-plan-studio/src-tauri/Cargo.toml',
  'apps/pile-plan-studio/src-tauri/Cargo.lock', 'crates/pile-plan-core/Cargo.toml',
  'crates/pile-plan-wasm/Cargo.toml', 'Cargo.lock',
  'apps/pile-plan-studio/src/core/wasm/pile-plan-wasm/package.json',
];
const packageFile = sourceFiles[0];
const wasmPackage = sourceFiles.at(-1);
const nextPackage = { version: '2026.43.0', release: { channel: 'alpha', date: '2026-10-21' } };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'pile-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of sourceFiles) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repo, file), join(root, file));
  }
  editJson(root, packageFile, (pkg) => {
    pkg.version = '0.4.3';
    pkg.release = { channel: 'alpha', date: null };
  });
  editJson(root, 'apps/pile-plan-studio/package-lock.json', (lock) => {
    lock.version = '0.4.3';
    lock.packages[''].version = '0.4.3';
  });
  for (const file of sourceFiles.filter((file) => file.endsWith('Cargo.toml'))) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/^version = "[^"]+"/m, 'version = "0.4.3"'));
  }
  for (const file of sourceFiles.filter((file) => file.endsWith('Cargo.lock'))) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      /(name = "pile-plan-(?:core|wasm|studio)"\r?\nversion = ")[^"]+(")/g,
      (_match, prefix, suffix) => `${prefix}0.4.3${suffix}`,
    ));
  }
  editJson(root, 'apps/pile-plan-studio/src-tauri/tauri.conf.json', (config) => { config.version = '0.4.3'; });
  editJson(root, wasmPackage, (pkg) => { pkg.version = '0.4.3'; });
  return root;
}

function editJson(root, file, edit) {
  const value = JSON.parse(readFileSync(join(root, file), 'utf8'));
  edit(value);
  writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n');
}

// Only substitute the external package generators; all synchronization and validation is real.
function generatedVersions(root) {
  for (const file of ['Cargo.lock', 'apps/pile-plan-studio/src-tauri/Cargo.lock']) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      /(name = "pile-plan-(?:core|wasm|studio)"\r?\nversion = ")[^"]+(")/g,
      (_match, prefix, suffix) => `${prefix}2026.43.0${suffix}`,
    ));
  }
  editJson(root, 'apps/pile-plan-studio/package-lock.json', (lock) => {
    lock.version = '2026.43.0';
    lock.packages[''].version = '2026.43.0';
  });
  editJson(root, wasmPackage, (pkg) => { pkg.version = '2026.43.0'; });
}

test('development consistency checks the current legacy version without permitting a release', (t) => {
  const root = fixture(t);
  assert.equal(project.checkProject(root).version, '0.4.3');
  assert.throws(() => project.checkProject(root, { requireRelease: true }), /version/i);
});

test('every manifest, local lock record and generated package mismatch is rejected with its file', (t) => {
  const root = fixture(t);
  for (const file of sourceFiles.slice(1)) {
    const path = join(root, file);
    const original = readFileSync(path, 'utf8');
    const pattern = file.endsWith('Cargo.lock')
      ? /(name = "pile-plan-core"\r?\nversion = ")0\.4\.3"/
      : /("version"\s*:\s*"|version = ")0\.4\.3"/;
    const modified = original.replace(pattern, (_match, prefix) => `${prefix}2026.43.9"`);
    assert.notEqual(modified, original, file);
    writeFileSync(path, modified);
    assert.throws(() => project.checkProject(root), (error) => error.message.includes(file), file);
    writeFileSync(path, original);
  }
  assert.doesNotThrow(() => project.checkProject(root));
});

test('a missing local Cargo record or generated package is rejected', (t) => {
  const root = fixture(t);
  const path = join(root, 'Cargo.lock');
  const original = readFileSync(path, 'utf8');
  writeFileSync(path, original.replace('name = "pile-plan-wasm"', 'name = "missing-wasm"'));
  assert.throws(() => project.checkProject(root), /pile-plan-wasm/);
  writeFileSync(path, original);
  rmSync(join(root, wasmPackage));
  assert.throws(() => project.checkProject(root), /package.json/);
});

test('preparation updates every owned version, preserves dependencies and is repeatable', (t) => {
  const root = fixture(t);
  const before = JSON.parse(readFileSync(join(root, packageFile), 'utf8')).dependencies;
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  assert.equal(project.checkProject(root, { tag: 'v2026.43.0' }).status, 'Alpha');
  const first = sourceFiles.map((file) => readFileSync(join(root, file), 'utf8'));
  assert.deepEqual(JSON.parse(first[0]).dependencies, before);
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  assert.deepEqual(sourceFiles.map((file) => readFileSync(join(root, file), 'utf8')), first);
  assert.equal(existsSync(join(root, '.release-preparation.json')), false);
});

test('failed preparation remains blocked until regeneration succeeds on a retry', (t) => {
  const root = fixture(t);
  assert.throws(() => project.prepareProject(root, nextPackage, { refresh() { throw new Error('WASM failed'); } }), /incomplete.*WASM failed/i);
  assert.equal(existsSync(join(root, '.release-preparation.json')), true);
  assert.throws(() => project.checkProject(root), /incomplete/i);
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  assert.equal(project.checkProject(root).version, '2026.43.0');
});

test('regeneration that upgrades a dependency is rejected even if the owned versions match', (t) => {
  const root = fixture(t);
  assert.throws(() => project.prepareProject(root, nextPackage, { refresh(root) {
    generatedVersions(root);
    editJson(root, 'apps/pile-plan-studio/package-lock.json', (lock) => {
      lock.packages['node_modules/react'].version = '99.0.0';
    });
  } }), /dependencies/i);
  assert.throws(() => project.checkProject(root), /incomplete/i);
});

test('Cargo refreshing CRLF locks to LF preserves the dependency baseline', (t) => {
  const root = fixture(t);
  for (const file of ['Cargo.lock', 'apps/pile-plan-studio/src-tauri/Cargo.lock']) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  assert.doesNotThrow(() => project.prepareProject(root, nextPackage, { refresh(root) {
    generatedVersions(root);
    for (const file of ['Cargo.lock', 'apps/pile-plan-studio/src-tauri/Cargo.lock']) {
      const path = join(root, file);
      writeFileSync(path, readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
    }
  } }));
});

test('release checks enforce matching tags and publication weeks but remain historical by default', (t) => {
  const root = fixture(t);
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  assert.throws(() => project.checkProject(root, { tag: 'v2026.43.1' }), /tag/i);
  assert.throws(() => project.checkProject(root, { publicationDate: '2026-10-26' }), /week/i);
  assert.equal(project.checkProject(root, { publicationDate: '2026-10-23' }).version, '2026.43.0');
  assert.equal(project.checkProject(root).version, '2026.43.0');
});

test('the pre-tag availability gate rejects both local/remote collisions and unreachable remotes without writing', (t) => {
  const root = fixture(t);
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  const before = sourceFiles.map((file) => readFileSync(join(root, file), 'utf8'));
  assert.throws(() => main(['check', '--release', '--available'], {
    root, readTags: () => ['v2026.43.0'], output() {},
  }), /already exists/);
  assert.throws(() => main(['check', '--release', '--available'], {
    root, readTags() { throw new Error('Remote unavailable'); }, output() {},
  }), /Remote unavailable/);
  assert.doesNotThrow(() => main(['check', '--release', '--available'], { root, readTags: () => [], output() {} }));
  assert.deepEqual(sourceFiles.map((file) => readFileSync(join(root, file), 'utf8')), before);
});

test('the workflow CLI emits proof-only GitHub outputs and rejects mismatches before writing outputs', (t) => {
  const root = fixture(t);
  project.prepareProject(root, nextPackage, { refresh: generatedVersions });
  const outputFile = join(root, 'github-output.txt');
  const values = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/issue-49',
    INPUT_RELEASE_TAG: 'v2026.43.0', GITHUB_OUTPUT: outputFile };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  Object.assign(process.env, values);
  main(['workflow', '--github-output'], { root, output() {} });
  const written = readFileSync(outputFile, 'utf8');
  assert.ok(written.includes('create_draft=false\n'));
  assert.ok(written.includes('sign=false\n'));
  assert.ok(written.includes('mode=proof\n'));
  assert.ok(written.includes('prerelease=true\n'));
  assert.ok(written.includes('title=Open Pile Plan Studio 2026.43.0 — Alpha\n'));
  process.env.INPUT_RELEASE_TAG = 'v2026.43.1';
  assert.throws(() => main(['workflow', '--github-output'], { root, output() {} }), /tag/i);
  assert.equal(readFileSync(outputFile, 'utf8'), written);
});
