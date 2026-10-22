import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { releaseInfo, checkTag, checkPublication } from './release-version.mjs';

export const appDirectory = 'apps/pile-plan-studio';
export const packageFile = `${appDirectory}/package.json`;
const marker = '.release-preparation.json';
const manifests = [
  ['crates/pile-plan-core/Cargo.toml', 'pile-plan-core'],
  ['crates/pile-plan-wasm/Cargo.toml', 'pile-plan-wasm'],
  [`${appDirectory}/src-tauri/Cargo.toml`, 'pile-plan-studio'],
];
const locks = [
  ['Cargo.lock', ['pile-plan-core', 'pile-plan-wasm']],
  [`${appDirectory}/src-tauri/Cargo.lock`, ['pile-plan-core', 'pile-plan-studio']],
];
const npmLock = `${appDirectory}/package-lock.json`;
const tauriConfig = `${appDirectory}/src-tauri/tauri.conf.json`;
const wasmPackage = `${appDirectory}/src/core/wasm/pile-plan-wasm/package.json`;
export const versionFiles = [packageFile, ...manifests.map(([file]) => file), tauriConfig,
  npmLock, ...locks.map(([file]) => file), wasmPackage];
const packageSection = /^\[package\]\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m;
const lockSections = /^\[\[package\]\]\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
const tomlValue = (body, key) => new RegExp(`^${key}[ \\t]*=[ \\t]*"([^"]+)"[ \\t]*\\r?$`, 'm').exec(body)?.[1];
const text = (root, file) => readFileSync(join(root, file), 'utf8');
const json = (root, file) => JSON.parse(text(root, file));
const writeJson = (root, file, value) => writeFileSync(join(root, file), JSON.stringify(value, null, 2) + '\n');

export function readPackage(root) { return json(root, packageFile); }

export function checkProject(root, { requireRelease = false, tag, publicationDate, ignorePreparationMarker = false } = {}) {
  if (!ignorePreparationMarker && existsSync(join(root, marker))) {
    throw new Error('Release preparation is incomplete; rerun release:prepare with the same date before building.');
  }
  const info = releaseInfo(readPackage(root), { allowLegacy: !(requireRelease || tag !== undefined || publicationDate !== undefined) });
  if (tag !== undefined) checkTag(tag, info.version);
  if (publicationDate !== undefined) checkPublication(info, publicationDate);
  const errors = [];
  const inspect = (file, read) => {
    try { read(); } catch (error) { errors.push(`${file}: ${error.message}`); }
  };
  const expect = (actual, label) => {
    if (actual !== info.version) throw new Error(`${label}: expected ${info.version}, found ${actual ?? 'missing'}.`);
  };
  for (const [file, name] of manifests) inspect(file, () => {
    const body = packageSection.exec(text(root, file))?.[1] ?? '';
    if (tomlValue(body, 'name') !== name) throw new Error(`Missing package ${name}.`);
    expect(tomlValue(body, 'version'), name);
  });
  for (const [file, names] of locks) inspect(file, () => {
    const records = [...text(root, file).matchAll(lockSections)].map((match) => match[1]);
    for (const name of names) {
      const found = records.filter((body) => tomlValue(body, 'name') === name);
      if (found.length !== 1) throw new Error(`Expected one local package ${name}, found ${found.length}.`);
      expect(tomlValue(found[0], 'version'), name);
    }
  });
  inspect(npmLock, () => {
    const lock = json(root, npmLock);
    expect(lock.version, 'root version');
    expect(lock.packages?.['']?.version, 'packages[""] version');
  });
  inspect(tauriConfig, () => expect(json(root, tauriConfig).version, 'Tauri version'));
  inspect(wasmPackage, () => expect(json(root, wasmPackage).version, 'generated WASM version'));
  if (errors.length) throw new Error(`Inconsistent product versions:\n${errors.join('\n')}`);
  return info;
}

function dependencyState(root) {
  const lock = json(root, npmLock);
  // Only the root package's versions may change during preparation.
  delete lock.version;
  delete lock.packages[''].version;
  return {
    npm: lock,
    cargo: locks.map(([file, names]) => text(root, file).replace(lockSections, (record, body) => {
      if (!names.includes(tomlValue(body, 'name'))) return record;
      return record.replace(/^version[ \t]*=[ \t]*"[^"]+"/m, 'version = "<product>"');
    }).replace(/\r\n/g, '\n')),
  };
}

function synchronizeSources(root, proposed) {
  const pkg = readPackage(root);
  pkg.version = proposed.version;
  pkg.release = proposed.release;
  writeJson(root, packageFile, pkg);
  const config = json(root, tauriConfig);
  config.version = pkg.version;
  writeJson(root, tauriConfig, config);
  for (const [file, name] of manifests) {
    const original = text(root, file);
    const body = packageSection.exec(original)?.[1] ?? '';
    if (tomlValue(body, 'name') !== name || !tomlValue(body, 'version')) {
      throw new Error(`${file}: cannot update package ${name}.`);
    }
    const updated = original.replace(packageSection, (section) => section.replace(
      /^(version[ \t]*=[ \t]*")[^"]+(")/m, (_match, before, after) => `${before}${pkg.version}${after}`,
    ));
    writeFileSync(join(root, file), updated);
  }
}

export function run(command, args, cwd, { capture = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`}`);
  }
  return result.stdout?.trim() ?? '';
}

export function runNpm(args, cwd) {
  const cli = process.env.npm_execpath ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  run(process.execPath, [cli, ...args], cwd);
}

export function refreshCargoLocks(root) {
  run('cargo', ['update', '--workspace', '--offline'], root, { capture: true });
  run('cargo', ['update', '--manifest-path', `${appDirectory}/src-tauri/Cargo.toml`, '--workspace', '--offline'], root, { capture: true });
}

function refreshPackages(root) {
  runNpm(['install', '--package-lock-only', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], join(root, appDirectory));
  refreshCargoLocks(root);
  runNpm(['run', 'build:wasm'], join(root, appDirectory));
}

export function prepareProject(root, proposed, { refresh = refreshPackages } = {}) {
  const info = releaseInfo(proposed);
  // Preserve the original dependency snapshot across retries of a partial preparation.
  const previous = existsSync(join(root, marker)) ? json(root, marker) : null;
  const dependencies = previous?.dependencies ?? dependencyState(root);
  dependencies.cargo = dependencies.cargo.map((lock) => lock.replace(/\r\n/g, '\n'));
  writeJson(root, marker, { version: info.version, date: info.date, dependencies });
  try {
    synchronizeSources(root, proposed);
    refresh(root);
    if (!isDeepStrictEqual(dependencyState(root), dependencies)) {
      throw new Error('Preparation changed dependencies; restore the unrelated dependency changes before retrying.');
    }
    checkProject(root, { requireRelease: true, ignorePreparationMarker: true });
    unlinkSync(join(root, marker));
    return info;
  } catch (error) {
    throw new Error(`Release preparation incomplete: ${error.message}`, { cause: error });
  }
}
