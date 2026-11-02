import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This acceptance series intentionally tests the previously verified signed bytes.
const sources = {
  linux: {id:41428425085, sha:'e1a1491b4182c55b285bb677cd6b0b107fc4ae7a'},
  macos: {id:41431616378, sha:'bb34fd753b56e126b8e77949a5a53c04ee11e63d'},
};
export function proofSource(run, platform, repository, branch) {
  const expected = sources[platform];
  if (!expected || !repository || !branch || run.id !== expected.id || run.head_sha !== expected.sha ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.head_branch !== branch || run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/release.yml') {
    throw new Error('Unexpected signed proof source; update the reviewed acceptance baseline before changing packages.');
  }
  return run.head_sha;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('sha=' + proofSource(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3],
    process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME));
}
