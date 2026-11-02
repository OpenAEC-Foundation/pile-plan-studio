import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMacosProofSource, validateMacosProofTests } from './verify_macos_proof_source.mjs';
test('a tag-built DMG is accepted only from the exact current run and commit', () => {
  const run={id:123,head_sha:'a'.repeat(40),head_branch:'v2026.45.0',event:'push',path:'.github/workflows/release.yml',
    repository:{full_name:'owner/repo'},head_repository:{full_name:'owner/repo'}};
  const current={id:'123',sha:run.head_sha};
  assert.equal(validateMacosProofSource(run,'owner/repo','v2026.45.0',current),run.head_sha);
  for (const context of [undefined,{id:'124',sha:run.head_sha},{id:'123',sha:'b'.repeat(40)}]) {
    assert.throws(()=>validateMacosProofSource(run,'owner/repo','v2026.45.0',context));
  }
});
test('rechecking a DMG requires completed native and frontend tests on the same architecture', () => {
  const names=['Run cargo test --workspace --locked',
    'Run cargo test --locked --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml','Run npm test'];
  const job={name:'macos-runtime (macos-15-intel)',steps:names.map(name=>({name,status:'completed',conclusion:'success'}))};
  assert.doesNotThrow(()=>validateMacosProofTests({jobs:[job]},'macos-15-intel'));
  assert.throws(()=>validateMacosProofTests({jobs:[job]},'macos-15'));
  assert.throws(()=>validateMacosProofTests({jobs:[job]},'other'));
  assert.throws(()=>validateMacosProofTests({jobs:[job,job]},'macos-15-intel'));
  for (const index of [0,1,2]) {
    const incomplete=structuredClone(job);
    incomplete.steps[index].conclusion='failure';
    assert.throws(()=>validateMacosProofTests({jobs:[incomplete]},'macos-15-intel'));
  }
});
test('proof packages must originate in the current repository, workflow and branch', () => {
  const run={head_sha:'a'.repeat(40),head_branch:'linux-macos-distribution',event:'workflow_dispatch',
    path:'.github/workflows/release.yml',repository:{full_name:'owner/repo'},head_repository:{full_name:'owner/repo'}};
  assert.equal(validateMacosProofSource(run,'owner/repo','linux-macos-distribution'),run.head_sha);
  for (const change of [{head_sha:'bad\noutput=true'}, {head_branch:'main'}, {event:'pull_request'},
    {path:'.github/workflows/other.yml'}, {repository:{full_name:'other/repo'}},
    {head_repository:{full_name:'fork/repo'}}]) {
    assert.throws(() => validateMacosProofSource({...run,...change},'owner/repo','linux-macos-distribution'));
  }
});
