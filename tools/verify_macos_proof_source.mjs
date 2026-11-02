import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateMacosProofSource(run, repository, branch, current) {
  const currentTagRun = run.event === 'push' && current && String(run.id) === current.id && run.head_sha === current.sha;
  if (!repository || !branch || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.head_branch !== branch ||
      (run.event !== 'workflow_dispatch' && !currentTagRun) || run.path !== '.github/workflows/release.yml' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new Error('DMG source must be a matching proof dispatch or the exact current release run.');
  }
  return run.head_sha;
}
export function validateMacosProofTests(result, runner) {
  if (!['macos-15','macos-15-intel'].includes(runner)) throw new Error('Unknown Mac architecture runner.');
  const jobs = result.jobs?.filter(job => job.name === 'macos-runtime (' + runner + ')') ?? [];
  const required = ['Run cargo test --workspace --locked',
    'Run cargo test --locked --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml', 'Run npm test'];
  if (jobs.length !== 1 || required.some(name => !jobs[0].steps?.some(step =>
    step.name === name && step.status === 'completed' && step.conclusion === 'success'))) {
    throw new Error('Source DMG requires successful native and frontend tests on ' + runner + '.');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const run = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    if (process.argv[3]) validateMacosProofTests(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.argv[4]);
    const current = process.argv[3] ? undefined : {id:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA};
    console.log('sha=' + validateMacosProofSource(run, process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME, current));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
