import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('macOS provides the PNG needed by Tauri codegen as well as its bundle ICNS', () => {
  const base = new URL('../apps/pile-plan-studio/src-tauri/', import.meta.url);
  const config = JSON.parse(readFileSync(new URL('tauri.macos.conf.json', base), 'utf8'));
  assert.ok(config.bundle.icon.some(path => path.endsWith('.icns')));
  const png = config.bundle.icon.find(path => path.endsWith('.png'));
  assert.ok(png, 'Tauri macOS codegen needs a configured PNG window icon');
  const bytes = readFileSync(new URL(png, base));
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
});
