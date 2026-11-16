import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validatePackageProofSource(run, repository, branch, current) {
  const currentRun = current && String(run.id) === current.id && run.head_sha === current.sha;
  if (!repository || !branch || run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository || run.head_branch !== branch ||
      (current && !currentRun) || (run.event !== 'workflow_dispatch' && !(run.event === 'push' && currentRun)) ||
      run.path !== '.github/workflows/release.yml' ||
      !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) {
    throw new Error('Package source must be a matching proof dispatch or the exact current release run.');
  }
  return run.head_sha;
}
const testJobsByRunner = {
  'ubuntu-22.04': ['linux'],
  'macos-15': ['macos'],
  'macos-15-intel': ['macos-intel-tests', 'macos-runtime (macos-15-intel)'],
};
const sourceTests = [
  'Run cargo test --workspace --locked',
  'Run cargo test --locked --manifest-path apps/pile-plan-studio/src-tauri/Cargo.toml',
  'Run npm test',
];

export function validatePackageProofTests(result, runner) {
  if (!Object.hasOwn(testJobsByRunner, runner)) throw new Error('Unknown package source runner.');
  const jobs = result.jobs ?? [];
  const builder = runner === 'ubuntu-22.04' ? 'linux' : 'macos';
  const builds = jobs.filter(job => job.name === builder);
  if (builds.length !== 1 || builds[0].conclusion !== 'success') {
    throw new Error('Package source requires a successful ' + builder + ' build.');
  }
  const required = builder === 'linux' ? [...sourceTests, 'Sign Linux downloads'] : sourceTests;
  const testsPassed = testJobsByRunner[runner].some(jobName => {
    const matchingJobs = jobs.filter(job => job.name === jobName);
    return matchingJobs.length === 1 && required.every(name => matchingJobs[0].steps?.some(step =>
      step.name === name && step.status === 'completed' && step.conclusion === 'success'));
  });
  if (!testsPassed) throw new Error('Package source is missing required successful steps for ' + runner + '.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const run = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    if (process.argv[3]) validatePackageProofTests(JSON.parse(readFileSync(process.argv[3], 'utf8')), process.argv[4]);
    const current = process.argv[3] ? undefined : {id:process.env.GITHUB_RUN_ID,sha:process.env.GITHUB_SHA};
    console.log(validatePackageProofSource(run, process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME, current));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
