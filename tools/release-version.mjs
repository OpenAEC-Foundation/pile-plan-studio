// Shared by the release CLI and the frontend build; no I/O or system-clock reads.
export function isoWeek(date) {
  if (typeof date !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid release date: ${date}; expected YYYY-MM-DD.`);
  }
  const value = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid release date: ${date}.`);
  }
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const year = value.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  return { year, week: Math.ceil(((value - start) / 86400000 + 1) / 7) };
}

export function amsterdamDate(now) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function parseReleaseVersion(version) {
  const match = typeof version === 'string' && /^([1-9]\d{3})\.([1-9]\d?)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error(`Invalid release version: ${version}; expected YYYY.W.N without leading zeros or suffixes.`);
  const [year, week, sequence] = match.slice(1).map(Number);
  const lastWeek = isoWeek(`${year}-12-28`).week;
  if (week > lastWeek || !Number.isSafeInteger(sequence) || sequence > 65535) {
    throw new Error(`Invalid release version: ${version}; check ISO week and Windows version limits (N <= 65535).`);
  }
  return { year, week, sequence };
}

export function nextVersion(date, tags) {
  const { year, week } = isoWeek(date);
  let maximum = -1;
  for (const tag of tags) {
    if (!tag.startsWith('v')) continue;
    let parsed;
    try { parsed = parseReleaseVersion(tag.slice(1)); } catch { continue; }
    if (parsed.year === year && parsed.week === week) maximum = Math.max(maximum, parsed.sequence);
  }
  const version = `${year}.${week}.${maximum + 1}`;
  parseReleaseVersion(version);
  return version;
}

export function checkTag(tag, version) {
  if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match version ${version}.`);
  parseReleaseVersion(version);
  return version;
}

export function releaseInfo(pkg, { allowLegacy = false } = {}) {
  const { version, release } = pkg;
  if (release?.channel !== 'alpha') throw new Error(`Unsupported release channel: ${release?.channel}.`);
  const legacy = allowLegacy && typeof version === 'string' && /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
  if (legacy) {
    if (release.date !== null) throw new Error('Legacy development version must have a null release date.');
  } else {
    const expected = parseReleaseVersion(version);
    const actual = isoWeek(release.date);
    if (actual.year !== expected.year || actual.week !== expected.week) {
      throw new Error(`Release date ${release.date} does not match version ${version}'s ISO week.`);
    }
  }
  return {
    version, date: release.date, channel: release.channel, status: 'Alpha', prerelease: true,
    tag: `v${version}`, title: `Open Pile Plan Studio ${version} — Alpha`,
  };
}

export function checkPublication(info, date) {
  const expected = parseReleaseVersion(info.version);
  const actual = isoWeek(date);
  if (actual.year !== expected.year || actual.week !== expected.week) {
    throw new Error(`Publication week ${actual.year}.${actual.week} differs from ${info.version}; prepare a new version and build.`);
  }
}
