export function proofPlatforms(value = 'windows') {
  if (value === 'all') return ['windows', 'linux', 'macos'];
  if (!['windows', 'linux', 'macos'].includes(value)) throw new Error('Invalid proof_platform.');
  return [value];
}
export function platformJobs(event, value) {
  if (!['push', 'workflow_dispatch'].includes(event)) throw new Error('Unsupported platform event.');
  const selected = event === 'push' ? ['windows'] : proofPlatforms(value);
  return Object.fromEntries(['windows', 'linux', 'macos'].map(name => [name, selected.includes(name)]));
}
