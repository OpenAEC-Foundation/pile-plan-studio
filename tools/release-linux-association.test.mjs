import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Linux package declares IFCPP MIME support and passes selected files to the app', () => {
  const base = new URL('../apps/pile-plan-studio/src-tauri/', import.meta.url);
  const config = JSON.parse(readFileSync(new URL('tauri.linux.conf.json', base), 'utf8'));
  assert.equal(config.bundle.fileAssociations?.find(a => a.ext.includes('ifcpp'))?.mimeType, 'application/x-ifcpp');
  const deb = config.bundle.linux.deb;
  const desktop = readFileSync(new URL(deb.desktopTemplate, base), 'utf8');
  assert.match(desktop, /^Exec=\{\{exec\}\} %F$/m);
  assert.match(desktop, /^MimeType=application\/x-ifcpp;$/m);
  const mime = readFileSync(new URL(deb.files['/usr/share/mime/packages/pile-plan-studio.xml'], base), 'utf8');
  assert.match(mime, /<mime-type type="application\/x-ifcpp">/);
  assert.match(mime, /<glob pattern="\*\.ifcpp"\s*\/>/);
});
