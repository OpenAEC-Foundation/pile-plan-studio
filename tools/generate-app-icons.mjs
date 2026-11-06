import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = join(root, 'apps/pile-plan-studio');
const source = 'branding/open-pile-plan-studio-logo-afgerond.png';
const approvedHash = 'ba4f607965cd00c2bd16a062ea54d84846e38ad9c4dbfc44cfab4666f2116b00';
const manifestPath = join(app, 'branding/generated-icons.json');
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
if (digest(join(app, source)) !== approvedHash) throw new Error('Source differs from the approved issue-59 artwork.');
if (process.argv[2] === '--check') {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.source !== source || manifest.sourceSha256 !== approvedHash) throw new Error('Icon manifest source mismatch.');
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (!existsSync(join(app, path)) || digest(join(app, path)) !== expected) throw new Error('Stale or missing app icon: '+path);
  }
  console.log('Approved logo and '+Object.keys(manifest.files).length+' generated app icons verified.');
} else {
  if (process.argv.length !== 2) throw new Error('Use generate-app-icons.mjs [--check].');
  mkdirSync(join(root, 'target'), { recursive: true });
  const temporary = mkdtempSync(join(root, 'target/app-icons-'));
  const result = spawnSync(process.execPath, [join(app, 'node_modules/@tauri-apps/cli/tauri.js'),
    'icon', join(app, source), '--output', temporary], { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw result.error ?? new Error('Tauri icon generation failed.');
  const files = {};
  for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico', 'icon.icns']) {
    const path = 'src-tauri/icons/'+name;
    copyFileSync(join(temporary, name), join(app, path)); files[path] = digest(join(app, path));
  }
  for (const [from, path] of [[join(app, source), 'public/pile-plan-studio-icon.png'],
    [join(temporary, '32x32.png'), 'public/favicon.png']]) {
    copyFileSync(from, join(app, path)); files[path] = digest(join(app, path));
  }
  writeFileSync(manifestPath, JSON.stringify({ source, sourceSha256: approvedHash, files }, null, 2)+'\n');
  console.log('Generated desktop and browser icons from the approved 512px raster source.');
}
