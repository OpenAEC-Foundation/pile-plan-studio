import { checkTag } from './release-version.mjs';

export function workflowPlan({ event, ref, tag }, version) {
  if (event === 'push') {
    if (!ref?.startsWith('refs/tags/')) throw new Error('A release push must reference a tag.');
    tag = ref.slice('refs/tags/'.length);
  } else if (event !== 'workflow_dispatch') {
    throw new Error(`Unsupported release workflow event: ${event}.`);
  }
  checkTag(tag, version);
  const proof = event === 'workflow_dispatch';
  return { tag, mode: proof ? 'proof' : 'release', sign: !proof, create_draft: !proof };
}
