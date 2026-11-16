import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePackageProofSource, validatePackageProofTests } from './verify_package_proof_source.mjs';
test('a tag-built DMG is accepted only from the exact current run and commit', () => {
  const run={id:123,head_sha:'a'.repeat(40),head_branch:'v2026.45.0',event:'push',path:'.github/workflows/release.yml',
    repository:{full_name:'owner/repo'},head_repository:{full_name:'owner/repo'}};
  const current={id:'123',sha:run.head_sha};
  assert.equal(validatePackageProofSource(run,'owner/repo','v2026.45.0',current),run.head_sha);
  for (const context of [undefined,{id:'124',sha:run.head_sha},{id:'123',sha:'b'.repeat(40)}]) {
    assert.throws(()=>validatePackageProofSource(run,'owner/repo','v2026.45.0',context));
  }
});
const testSteps = ['Run cargo test --workspace --locked',
  'Run cargo test --locked --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml', 'Run npm test'];
const completedJob = (name, steps = testSteps) => ({
  name, conclusion: 'success',
  steps: steps.map(name => ({ name, status: 'completed', conclusion: 'success' })),
});

test('DMG proofs require the builder and accept Intel source tests from either workflow layout', () => {
  const builder = completedJob('macos');
  assert.doesNotThrow(() => validatePackageProofTests({ jobs: [builder] }, 'macos-15'));
  assert.throws(() => validatePackageProofTests({ jobs: [builder] }, 'macos-15-intel'));
  for (const name of ['macos-intel-tests', 'macos-runtime (macos-15-intel)']) {
    const intel = completedJob(name);
    assert.doesNotThrow(() => validatePackageProofTests({ jobs: [builder, intel] }, 'macos-15-intel'));
    assert.throws(() => validatePackageProofTests({ jobs: [intel] }, 'macos-15-intel'));
    assert.throws(() => validatePackageProofTests({ jobs: [builder, intel, intel] }, 'macos-15-intel'));
    for (const step of intel.steps) {
      step.conclusion = 'failure';
      assert.throws(() => validatePackageProofTests({ jobs: [builder, intel] }, 'macos-15-intel'));
      step.conclusion = 'success';
    }
  }
});
test('Linux proofs require a successful builder with source tests and signing', () => {
  const unsigned = completedJob('linux');
  const signed = completedJob('linux', [...testSteps, 'Sign Linux downloads']);
  assert.doesNotThrow(() => validatePackageProofTests({ jobs: [signed] }, 'ubuntu-22.04'));
  assert.throws(() => validatePackageProofTests({ jobs: [unsigned] }, 'ubuntu-22.04'));
  assert.throws(() => validatePackageProofTests({ jobs: [{ ...signed, conclusion: 'failure' }] }, 'ubuntu-22.04'));
  assert.throws(() => validatePackageProofTests({ jobs: [signed] }, 'unknown'));
});
test('proof packages must originate in the current repository, workflow and branch', () => {
  const run={head_sha:'a'.repeat(40),head_branch:'linux-macos-distribution',event:'workflow_dispatch',
    path:'.github/workflows/release.yml',repository:{full_name:'owner/repo'},head_repository:{full_name:'owner/repo'}};
  assert.equal(validatePackageProofSource(run,'owner/repo','linux-macos-distribution'),run.head_sha);
  for (const change of [{head_sha:'bad\noutput=true'}, {head_branch:'main'}, {event:'pull_request'},
    {path:'.github/workflows/other.yml'}, {repository:{full_name:'other/repo'}},
    {head_repository:{full_name:'fork/repo'}}]) {
    assert.throws(() => validatePackageProofSource({...run,...change},'owner/repo','linux-macos-distribution'));
  }
});

test('a fresh proof uses packages from its exact current run', () => {
  const run = { id: 123, head_sha: 'a'.repeat(40), head_branch: 'release-next', event: 'workflow_dispatch',
    path: '.github/workflows/release.yml', repository: { full_name: 'owner/repo' }, head_repository: { full_name: 'owner/repo' } };
  assert.equal(validatePackageProofSource(run, 'owner/repo', 'release-next', { id: '123', sha: run.head_sha }), run.head_sha);
  assert.throws(() => validatePackageProofSource(run, 'owner/repo', 'release-next', { id: '124', sha: run.head_sha }));
});
