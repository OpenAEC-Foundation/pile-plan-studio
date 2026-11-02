import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proofSource } from './source.mjs';
const repository = 'OpenAEC-Foundation/pile-plan-studio';
const run = {id: 41445723226, repository: {full_name: repository}, head_repository: {full_name: repository},
  head_branch: 'linux-macos-distribution', event: 'workflow_dispatch', path: '.github/workflows/release.yml',
  head_sha: 'db3350ef649bdf107b5ff9d3939201532b4ebac8'};
test('accept only the known signed package source from this branch and repository', () => {
  assert.equal(proofSource(run, 'linux', repository, run.head_branch), run.head_sha);
  for (const changed of [{id: 1}, {event:'pull_request'}, {head_sha:'a'.repeat(40)},
    {path:'.github/workflows/other.yml'}, {head_repository:{full_name:'fork/repo'}}, {head_branch:'main'}]) {
    assert.throws(() => proofSource({...run, ...changed}, 'linux', repository, run.head_branch));
  }
  assert.throws(() => proofSource(run, 'macos', repository, run.head_branch));
  assert.throws(() => proofSource(run, 'windows', repository, run.head_branch));
});
