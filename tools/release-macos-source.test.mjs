import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMacosProofSource } from './verify_macos_proof_source.mjs';
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
