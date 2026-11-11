import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proofPlatforms, platformJobs, macosProofRun } from './release-platforms.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
test('existing macOS packages can only be rechecked in explicit signed macOS dispatches', () => {
  assert.equal(macosProofRun({}), '');
  const input={event:'workflow_dispatch',platform:'macos',signProof:true,runId:'41431616378'};
  assert.equal(macosProofRun(input), '41431616378');
  for (const change of [{event:'push'}, {platform:'linux'}, {signProof:false},
    {runId:'../other'}, {runId:'0'}, {runId:'1\n2'}]) {
    assert.throws(() => macosProofRun({...input,...change}));
  }
});
test('proof selection defaults to Windows and expands only supported names', () => {
  assert.deepEqual(proofPlatforms(), ['windows']);
  for (const name of ['windows', 'linux', 'macos']) assert.deepEqual(proofPlatforms(name), [name]);
  assert.deepEqual(proofPlatforms('all'), ['windows', 'linux', 'macos']);
  for (const bad of ['', 'Linux', 'linux,macos', null]) assert.throws(() => proofPlatforms(bad));
});
test('release runs build all three platforms while proofs retain explicit selection', () => {
  assert.deepEqual(platformJobs('push'), {windows:true,linux:true,macos:true});
  assert.deepEqual(platformJobs('push', 'windows'), {windows:true,linux:true,macos:true});
  assert.deepEqual(platformJobs('workflow_dispatch', 'linux'), {windows:false,linux:true,macos:false});
  assert.deepEqual(platformJobs('workflow_dispatch', 'windows', true), {windows:true,linux:true,macos:true});
  assert.throws(() => platformJobs('pull_request', 'all'));
});
test('release candidate dispatch signs all platforms and rejects a reused proof', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = JSON.parse(readFileSync(new URL('../apps/pile-plan-studio/package.json', import.meta.url))).version;
  const run = (overrides = {}) => spawnSync(process.execPath, ['tools/release.mjs', 'workflow'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/release-next',
      INPUT_RELEASE_TAG: 'v' + version, INPUT_RELEASE_CANDIDATE: 'true', INPUT_SIGN_PROOF: 'false',
      INPUT_PROOF_PLATFORM: 'macos', INPUT_MACOS_PROOF_RUN_ID: '', ...overrides },
  });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.create_draft, true);
  assert.equal(plan.sign, true);
  for (const platform of ['windows', 'linux', 'macos']) assert.equal(plan['build_' + platform], true);
  for (const input of [{ INPUT_MACOS_PROOF_RUN_ID: '123' }, { INPUT_RELEASE_CANDIDATE: 'yes' }]) {
    const invalid = run(input);
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
  }
});
test('workflow CLI transports platform selection without enabling publication', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = JSON.parse(readFileSync(new URL('../apps/pile-plan-studio/package.json', import.meta.url))).version;
  for (const selected of ['windows', 'linux', 'macos', 'all']) {
    const result = spawnSync(process.execPath, ['tools/release.mjs', 'workflow'], {
      cwd: root, encoding: 'utf8', windowsHide: true,
      env: {...process.env, GITHUB_EVENT_NAME:'workflow_dispatch', INPUT_RELEASE_TAG:'v'+version,
        INPUT_SIGN_PROOF:'false', INPUT_PROOF_PLATFORM:selected},
    });
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.create_draft, false);
    assert.equal(plan.sign, false);
    for (const name of ['windows', 'linux', 'macos']) assert.equal(plan['build_'+name], selected === 'all' || selected === name);
  }
});
test('workflow CLI rejects invalid platform before returning a runnable plan', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = JSON.parse(readFileSync(new URL('../apps/pile-plan-studio/package.json', import.meta.url))).version;
  const result = spawnSync(process.execPath, ['tools/release.mjs', 'workflow'], {
    cwd: root, encoding:'utf8', windowsHide:true,
    env:{...process.env, GITHUB_EVENT_NAME:'workflow_dispatch', INPUT_RELEASE_TAG:'v'+version,
      INPUT_SIGN_PROOF:'true', INPUT_PROOF_PLATFORM:'unknown'},
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /proof_platform/);
});
