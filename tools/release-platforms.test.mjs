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
test('tags build all three platforms while manual proofs retain explicit selection', () => {
  assert.deepEqual(platformJobs('push'), {windows:true,linux:true,macos:true});
  assert.deepEqual(platformJobs('push', 'windows'), {windows:true,linux:true,macos:true});
  assert.deepEqual(platformJobs('workflow_dispatch', 'linux'), {windows:false,linux:true,macos:false});
  assert.throws(() => platformJobs('pull_request', 'all'));
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
