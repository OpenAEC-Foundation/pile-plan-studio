import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workflowPlan } from './release-workflow.mjs';

test('a matching new tag uses the signed draft-release path', () => {
  assert.deepEqual(workflowPlan({ event: 'push', ref: 'refs/tags/v2026.43.0' }, '2026.43.0'), {
    tag: 'v2026.43.0', mode: 'release', sign: true, create_draft: true,
  });
});

test('a manual proof accepts the same tag format but cannot sign or create a release', () => {
  assert.deepEqual(workflowPlan({ event: 'workflow_dispatch', ref: 'refs/heads/issue-49', tag: 'v2026.43.0' }, '2026.43.0'), {
    tag: 'v2026.43.0', mode: 'proof', sign: false, create_draft: false,
  });
});

test('an explicitly requested signed proof signs without creating a release', () => {
  assert.deepEqual(workflowPlan({
    event: 'workflow_dispatch', ref: 'refs/heads/windows-app-signing', tag: 'v2026.43.0', signProof: true,
  }, '2026.43.0'), {
    tag: 'v2026.43.0', mode: 'signed-proof', sign: true, create_draft: false,
  });
});

test('a signed proof still rejects an incorrect tag and invalid signing input', () => {
  assert.throws(() => workflowPlan({ event: 'workflow_dispatch', tag: 'v2026.43.1', signProof: true }, '2026.43.0'), /tag|version/i);
  assert.throws(() => workflowPlan({ event: 'workflow_dispatch', tag: 'v2026.43.0', signProof: 'false' }, '2026.43.0'), /sign|boolean/i);
});

test('branch pushes, unknown events, old alpha tags and mismatched tags fail before building', () => {
  for (const event of [
    { event: 'push', ref: 'refs/heads/main' },
    { event: 'pull_request', ref: 'refs/tags/v2026.43.0' },
    { event: 'push', ref: 'refs/tags/v2026.43.0-alpha' },
    { event: 'push', ref: 'refs/tags/v2026.43.1' },
    { event: 'workflow_dispatch', tag: '' },
    { event: 'workflow_dispatch', tag: 'v2026.03.0' },
  ]) assert.throws(() => workflowPlan(event, '2026.43.0'), /event|tag|version/i);
});
