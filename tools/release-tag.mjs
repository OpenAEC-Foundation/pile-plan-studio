export function ensureReleaseTag({ repo, tag, sha, create = false }, api) {
  const ref = 'refs/tags/' + tag;
  const base = 'repos/' + repo + '/git/';
  const matches = api(base + 'matching-refs/tags/' + tag);
  if (!Array.isArray(matches)) throw new Error('Invalid release tag lookup.');
  const existing = matches.find(match => match.ref === ref);
  if (existing) {
    let target = existing.object;
    for (let level = 0; target?.type === 'tag' && level < 4; level++) {
      target = api(base + 'tags/' + target.sha).object;
    }
    if (target?.type !== 'commit' || target.sha !== sha) {
      throw new Error('Release tag does not point at the verified build commit.');
    }
    return;
  }
  if (!create) throw new Error('Release tag is missing.');
  const object = api(base + 'tags', { tag, message: 'Open Pile Plan Studio ' + tag, object: sha, type: 'commit' });
  if (!/^[a-f0-9]{40}$/.test(object.sha ?? '') || object.object?.type !== 'commit' || object.object.sha !== sha) {
    throw new Error('GitHub returned a tag object for a different commit.');
  }
  const created = api(base + 'refs', { ref, sha: object.sha });
  if (created.ref !== ref || created.object?.type !== 'tag' || created.object.sha !== object.sha) {
    throw new Error('GitHub returned an unexpected tag reference.');
  }
}
