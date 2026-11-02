export function proofPlatforms(value = 'windows') {
  if (value === 'all') return ['windows', 'linux', 'macos'];
  if (!['windows', 'linux', 'macos'].includes(value)) throw new Error('Invalid proof_platform.');
  return [value];
}
export function platformJobs(event, value) {
  if (!['push', 'workflow_dispatch'].includes(event)) throw new Error('Unsupported platform event.');
  const selected = event === 'push' ? ['windows', 'linux', 'macos'] : proofPlatforms(value);
  return Object.fromEntries(['windows', 'linux', 'macos'].map(name => [name, selected.includes(name)]));
}
export function macosProofRun({event, platform, signProof, runId = ''}) {
  if (runId === '') return '';
  if (event !== 'workflow_dispatch' || platform !== 'macos' || signProof !== true ||
      !/^[1-9][0-9]*$/.test(runId) || !Number.isSafeInteger(Number(runId))) {
    throw new Error('Existing macOS proof run requires a numeric run ID and an explicit signed macOS dispatch.');
  }
  return runId;
}
