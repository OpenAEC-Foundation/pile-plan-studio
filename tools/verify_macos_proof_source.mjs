import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateMacosProofSource(run, repository, branch) {
  if (!repository || !branch || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.head_branch !== branch ||
      run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/release.yml' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new Error('DMG source must be a release-workflow dispatch from the current repository and branch.');
  }
  return run.head_sha;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const run = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    console.log('sha=' + validateMacosProofSource(run, process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
