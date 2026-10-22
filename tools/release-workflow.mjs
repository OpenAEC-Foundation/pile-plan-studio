import { checkTag } from './release-version.mjs';

export function workflowPlan({ event, ref, tag, signProof = false }, version) {
  if (typeof signProof !== 'boolean') throw new Error('Signing proof input must be boolean.');
  if (event === 'push') {
    if (!ref?.startsWith('refs/tags/')) throw new Error('A release push must reference a tag.');
    tag = ref.slice('refs/tags/'.length);
  } else if (event !== 'workflow_dispatch') {
    throw new Error(`Unsupported release workflow event: ${event}.`);
  }
  checkTag(tag, version);
  const proof = event === 'workflow_dispatch';
  return { tag, mode: proof ? (signProof ? 'signed-proof' : 'proof') : 'release', sign: !proof || signProof, create_draft: !proof };
}
