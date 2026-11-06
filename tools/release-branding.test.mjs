import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

test('the app uses the exact approved issue-59 artwork as its browser mark', () => {
  const app = new URL('../apps/pile-plan-studio/', import.meta.url);
  const approved = readFileSync(new URL('branding/open-pile-plan-studio-logo-afgerond.png', app));
  assert.equal(createHash('sha256').update(approved).digest('hex'), 'ba4f607965cd00c2bd16a062ea54d84846e38ad9c4dbfc44cfab4666f2116b00');
  assert.deepEqual(readFileSync(new URL('public/pile-plan-studio-icon.png', app)), approved);
});
