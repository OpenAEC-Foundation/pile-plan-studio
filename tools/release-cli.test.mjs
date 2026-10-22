import assert from 'node:assert/strict';
import { test } from 'node:test';
import { main, readGitTags } from './release.mjs';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const packagePath = resolve(root, 'apps/pile-plan-studio/package.json');

test('prepare dry-run selects from both local and remote tags and never writes', () => {
  const before = readFileSync(packagePath, 'utf8');
  const lines = [];
  main(['prepare', '--date', '2026-10-21', '--dry-run'], {
    root, readTags: () => ['v2026.43.9', 'v2026.43.10'], output: (line) => lines.push(line),
  });
  assert.match(lines.join('\n'), /2026\.43\.11/);
  assert.match(lines.join('\n'), /Alpha/);
  assert.match(lines.join('\n'), /dry.run/i);
  assert.equal(readFileSync(packagePath, 'utf8'), before);
  assert.equal(existsSync(resolve(root, '.release-preparation.json')), false);
});

test('a remote failure blocks preparation before any write', () => {
  const before = readFileSync(packagePath, 'utf8');
  assert.throws(() => main(['prepare', '--date', '2026-10-21'], {
    root, readTags: () => { throw new Error('Remote unavailable'); }, output() {},
  }), /Remote unavailable/);
  assert.equal(readFileSync(packagePath, 'utf8'), before);
  assert.equal(existsSync(resolve(root, '.release-preparation.json')), false);
});

test('Git tags are read from local and remote refs without fetching or editing refs', () => {
  const calls = [];
  const tags = readGitTags(root, (_cmd, args) => {
    calls.push(args);
    if (args[0] === 'tag') return 'v2026.43.9\nv0.4.3-alpha';
    return 'abc\trefs/tags/v2026.43.10\ndef\trefs/tags/v2026.42.0';
  });
  assert.deepEqual(tags, ['v2026.43.9', 'v0.4.3-alpha', 'v2026.43.10', 'v2026.42.0']);
  assert.deepEqual(calls, [['tag', '--list'], ['ls-remote', '--tags', '--refs', 'origin']]);
});

test('unknown commands, options and misplaced date arguments fail closed', () => {
  for (const args of [['publish'], ['prepare', '--dryrun'], ['check', '--date', '2026-10-21'], ['info', '--publish'], ['check', '--dry-run']]) {
    assert.throws(() => main(args, { root, output() {} }), /command|option|only|unexpected/i);
  }
});

test('an explicitly empty tag cannot bypass the release gate', () => {
  assert.throws(() => main(['check', '--tag', ''], { root, output() {} }), /tag|version/i);
});

test('offline consistency and info work without accessing Git or the current date', () => {
  const output = [];
  const options = { root, readTags() { throw new Error('Unexpected network'); }, output: (line) => output.push(line) };
  main(['check'], options);
  main(['info'], options);
  assert.ok(output.join('\n').includes(JSON.parse(readFileSync(packagePath, 'utf8')).version));
  assert.match(output.join('\n'), /Alpha/);
});

test('workflow CLI honors an explicit signed proof and rejects ambiguous signing input', () => {
  const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  const env = { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/windows-app-signing', INPUT_RELEASE_TAG: `v${version}` };
  const run = value => spawnSync(process.execPath, [resolve(root, 'tools/release.mjs'), 'workflow'], {
    cwd: root, env: { ...env, INPUT_SIGN_PROOF: value }, encoding: 'utf8',
  });
  const signed = run('true');
  assert.equal(signed.status, 0, signed.stderr);
  const result = JSON.parse(signed.stdout);
  assert.equal(result.mode, 'signed-proof');
  assert.equal(result.sign, true);
  assert.equal(result.create_draft, false);
  const invalid = run('yes');
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /INPUT_SIGN_PROOF|boolean/i);
});
