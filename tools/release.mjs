import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { amsterdamDate, isoWeek, nextVersion, releaseInfo } from './release-version.mjs';
import { checkProject, prepareProject, readPackage, run, versionFiles } from './release-project.mjs';
import { workflowPlan } from './release-workflow.mjs';

export function readGitTags(root, execute = run) {
  const local = execute('git', ['tag', '--list'], root, { capture: true });
  const remote = execute('git', ['ls-remote', '--tags', '--refs', 'origin'], root, { capture: true });
  return [...local.split(/\r?\n/).filter(Boolean), ...remote.split(/\r?\n/).flatMap((line) => {
    const match = /\srefs\/tags\/(.+)$/.exec(line);
    return match ? [match[1]] : [];
  })];
}

function assertAvailable(tag, tags) {
  if (tags.includes(tag)) throw new Error(`Tag ${tag} already exists locally or remotely; do not reuse or move it.`);
}

export function main(args, {
  root = resolve(import.meta.dirname, '..'), now = () => new Date(),
  readTags = readGitTags, output = console.log,
} = {}) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    date: { type: 'string' }, 'dry-run': { type: 'boolean' }, tag: { type: 'string' },
    release: { type: 'boolean' }, publish: { type: 'boolean' }, available: { type: 'boolean' },
    'github-output': { type: 'boolean' },
  } });
  const [command] = positionals;
  const allowed = {
    prepare: ['date', 'dry-run'], check: ['tag', 'release', 'publish', 'available'], info: ['github-output'], workflow: ['github-output'],
  };
  if (positionals.length !== 1 || !allowed[command]) throw new Error('Expected one command: prepare, check, info or workflow.');
  for (const option of Object.keys(values)) {
    if (!allowed[command].includes(option)) throw new Error(`Option --${option} is not supported by ${command}.`);
  }
  if (command === 'prepare') {
    const date = values.date ?? amsterdamDate(now());
    isoWeek(date);
    const tags = readTags(root); // Must succeed before writing anything, including the marker.
    const pendingPath = join(root, '.release-preparation.json');
    const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, 'utf8')) : null;
    const version = pending?.date === date ? pending.version : nextVersion(date, tags);
    const current = readPackage(root);
    const proposed = { version, release: { channel: current.release?.channel, date } };
    const info = releaseInfo(proposed);
    assertAvailable(info.tag, tags);
    output(`${values['dry-run'] ? 'Dry-run' : 'Prepare'}: ${info.title}; date ${date}; tag ${info.tag}.`);
    output(`Product version: ${current.version} -> ${info.version}. Version fields to synchronize:`);
    for (const file of versionFiles) output(`  ${file}`);
    output('Synchronize npm, core/WASM/Tauri manifests and Tauri config; refresh both Cargo locks and npm lock; regenerate WASM via npm run build:wasm.');
    if (!values['dry-run']) prepareProject(root, proposed);
    return info;
  }
  const info = checkProject(root, {
    requireRelease: values.release || values.available || command === 'workflow',
    tag: values.tag,
    publicationDate: values.publish ? amsterdamDate(now()) : undefined,
  });
  if (command === 'workflow' && !['', 'false', 'true'].includes(process.env.INPUT_SIGN_PROOF ?? '')) {
    throw new Error('INPUT_SIGN_PROOF must be a boolean (true or false).');
  }
  if (values.available) assertAvailable(info.tag, readTags(root));
  if (command === 'info' || command === 'workflow') {
    const details = command === 'workflow' ? { ...info, ...workflowPlan({
      event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, tag: process.env.INPUT_RELEASE_TAG,
      signProof: process.env.INPUT_SIGN_PROOF === 'true',
    }, info.version) } : info;
    if (values['github-output']) {
      if (!process.env.GITHUB_OUTPUT) throw new Error('--github-output requires GITHUB_OUTPUT.');
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(details).map(([key, value]) => `${key}=${value ?? ''}\n`).join(''));
    }
    output(JSON.stringify(details));
  } else {
    output(`Consistent product version: ${info.version} · ${info.status}${values.tag ? ` (${values.tag})` : ''}.`);
  }
  return info;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
