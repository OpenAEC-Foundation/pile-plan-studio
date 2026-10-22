import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as release from './release-version.mjs';

test('ISO weeks use the week-year, including valid week 53', () => {
  assert.deepEqual(release.isoWeek('2026-12-31'), { year: 2026, week: 53 });
  assert.deepEqual(release.isoWeek('2027-01-01'), { year: 2026, week: 53 });
  assert.deepEqual(release.isoWeek('2027-01-04'), { year: 2027, week: 1 });
  assert.deepEqual(release.isoWeek('2026-01-01'), { year: 2026, week: 1 });
});

test('release dates reject normalized, incomplete and impossible calendar dates', () => {
  for (const date of ['2026-02-29', '2026-13-01', '2026-2-01', '2026-01-01T00:00:00Z', '', null]) {
    assert.throws(() => release.isoWeek(date), /date/i);
  }
});

test('the default release date follows Amsterdam even across UTC midnight', () => {
  assert.equal(release.amsterdamDate(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.equal(release.amsterdamDate(new Date('2026-07-05T22:30:00Z')), '2026-07-06');
});

test('release version parser accepts only canonical supported ISO versions', () => {
  assert.deepEqual(release.parseReleaseVersion('2026.53.0'), { year: 2026, week: 53, sequence: 0 });
  assert.equal(release.parseReleaseVersion('2027.1.65535').sequence, 65535);
  for (const version of ['2026.03.0', '2026.3.00', '2026.0.0', '2027.53.0', '2026.54.0',
    '2026.43.65536', '2026.43.0-alpha', '2026-43', 'v2026.43.0', '0.4.3', '2026.43.0.0']) {
    assert.throws(() => release.parseReleaseVersion(version), /version/i);
  }
});

test('next version uses the numeric maximum across all existing tags in the week', () => {
  const tags = ['v0.4.3-alpha', 'v2026.42.88', 'v2026.43.0', 'v2026.43.9', 'v2026.43.10', 'v2026.44.0'];
  assert.equal(release.nextVersion('2026-10-21', tags), '2026.43.11');
  assert.equal(release.nextVersion('2026-10-26', tags), '2026.44.1');
  assert.equal(release.nextVersion('2027-01-04', tags), '2027.1.0');
  assert.throws(() => release.nextVersion('2026-10-21', ['v2026.43.65535']), /version/i);
});

test('tag checking rejects suffixes, malformed versions and version mismatches', () => {
  assert.equal(release.checkTag('v2026.43.0', '2026.43.0'), '2026.43.0');
  for (const tag of ['2026.43.0', 'v2026.43.0-alpha', 'v2026.43.1', 'v2026.03.0']) {
    assert.throws(() => release.checkTag(tag, '2026.43.0'), /tag|version/i);
  }
});

test('metadata derives Alpha independently and rejects unknown channels or inconsistent dates', () => {
  assert.deepEqual(release.releaseInfo({ version: '2026.43.0', release: { channel: 'alpha', date: '2026-10-21' } }), {
    version: '2026.43.0', date: '2026-10-21', channel: 'alpha', status: 'Alpha', prerelease: true,
    tag: 'v2026.43.0', title: 'Open Pile Plan Studio 2026.43.0 — Alpha',
  });
  assert.throws(() => release.releaseInfo({ version: '2026.43.0', release: { channel: 'stable', date: '2026-10-21' } }), /channel/i);
  assert.throws(() => release.releaseInfo({ version: '2026.43.0', release: { channel: 'alpha', date: '2026-10-26' } }), /date|week/i);
  assert.throws(() => release.releaseInfo({ version: '2026.43.0', release: { channel: 'alpha', date: null } }), /date/i);
});

test('legacy development remains checkable but cannot pass the release gate', () => {
  const legacy = { version: '0.4.3', release: { channel: 'alpha', date: null } };
  assert.equal(release.releaseInfo(legacy, { allowLegacy: true }).status, 'Alpha');
  assert.throws(() => release.releaseInfo(legacy), /version/i);
  assert.throws(() => release.releaseInfo({ ...legacy, version: 'nonsense' }, { allowLegacy: true }), /version/i);
});

test('publication checks the current week without making historical consistency depend on the clock', () => {
  const info = release.releaseInfo({ version: '2026.53.0', release: { channel: 'alpha', date: '2026-12-31' } });
  assert.doesNotThrow(() => release.checkPublication(info, '2027-01-01'));
  assert.throws(() => release.checkPublication(info, '2027-01-04'), /week/i);
  assert.equal(info.version, '2026.53.0');
});
