import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureReleaseTag } from './release-tag.mjs';

const tag = 'v2026.46.3';
const ref = 'refs/tags/' + tag;
const sha = 'a'.repeat(40);
const annotated = 'b'.repeat(40);
const context = { repo: 'OpenAEC-Foundation/pile-plan-studio', tag, sha };

function github(initial = null) {
  let target = initial;
  const writes = [];
  return { writes, api(endpoint, fields) {
    if (fields) {
      writes.push({ endpoint, fields });
      if (endpoint.endsWith('/git/tags')) return { sha: annotated, object: { type: 'commit', sha } };
      assert.ok(endpoint.endsWith('/git/refs'));
      assert.deepEqual(fields, { ref, sha: annotated });
      target = { type: 'tag', sha: annotated };
      return { ref, object: target };
    }
    if (endpoint.endsWith('/git/tags/' + annotated)) return { object: { type: 'commit', sha } };
    assert.ok(endpoint.endsWith('/git/matching-refs/tags/' + tag));
    return [...(target ? [{ ref, object: target }] : []), { ref: ref + '0', object: { type: 'commit', sha } }];
  } };
}

test('creates an annotated tag once for the verified commit and can resume it', () => {
  const { api, writes } = github();
  ensureReleaseTag({ ...context, create: true }, api);
  assert.deepEqual(writes[0].fields, { tag, message: 'Open Pile Plan Studio ' + tag, object: sha, type: 'commit' });
  ensureReleaseTag({ ...context, create: true }, api);
  assert.equal(writes.length, 2);
});

test('a tag-triggered run requires an existing matching tag', () => {
  const existing = github({ type: 'commit', sha });
  ensureReleaseTag(context, existing.api);
  assert.deepEqual(existing.writes, []);
  const missing = github();
  assert.throws(() => ensureReleaseTag(context, missing.api), /tag.*missing/i);
  assert.deepEqual(missing.writes, []);
});

test('an existing tag at another commit is never moved', () => {
  const { api, writes } = github({ type: 'commit', sha: 'c'.repeat(40) });
  assert.throws(() => ensureReleaseTag({ ...context, create: true }, api), /tag.*verified build commit/i);
  assert.deepEqual(writes, []);
});
