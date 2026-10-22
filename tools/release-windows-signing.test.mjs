import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const windows = { skip: process.platform !== 'win32' };
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pile-signing-'));
  t.after(() => {
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}
function powershell(script, args, env = {}) {
  return spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', join(root, script), ...args], {
    cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true,
  });
}
function toolFiles(directory, includeDlib = true) {
  const sdk = join(directory, 'SDK with spaces', 'bin', '10.0.26100.0', 'x64');
  const client = join(directory, 'signing client', 'bin', 'x64');
  mkdirSync(sdk, { recursive: true });
  mkdirSync(client, { recursive: true });
  writeFileSync(join(sdk, 'signtool.exe'), 'tool-path fixture; never executed');
  if (includeDlib) writeFileSync(join(client, 'Azure.CodeSigning.Dlib.dll'), 'client-path fixture; never loaded');
  return { signtool: join(sdk, 'signtool.exe'), dlib: join(client, 'Azure.CodeSigning.Dlib.dll') };
}
const signingEnv = {
  AZURE_ENDPOINT: 'https://weu.codesigning.azure.net/', AZURE_ACCOUNT: 'test-account', AZURE_PROFILE: 'test-profile',
  AZURE_CLIENT_SECRET: 'must-not-be-written',
};

test('signing configuration passes absolute tools and binary placeholder to Tauri without persisting credentials', windows, t => {
  const directory = fixture(t);
  const tools = toolFiles(directory);
  const output = join(directory, 'output with spaces');
  const result = powershell('tools/configure_windows_signing.ps1', ['-ToolRoot', directory, '-OutputDirectory', output], signingEnv);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = JSON.parse(readFileSync(join(output, 'tauri.windows-signing.json'), 'utf8'));
  // Windows runners expose TEMP through its 8.3 alias; PowerShell expands it.
  const { cmd, args } = config.bundle.windows.signCommand;
  assert.equal(realpathSync.native(cmd), realpathSync.native(tools.signtool));
  const canonicalArgs = args.map((arg, index) => [9, 11].includes(index) ? realpathSync.native(arg) : arg);
  assert.deepEqual(canonicalArgs, [
    'sign', '/v', '/fd', 'SHA256', '/tr', 'http://timestamp.acs.microsoft.com', '/td', 'SHA256',
    '/dlib', realpathSync.native(tools.dlib), '/dmdf', realpathSync.native(join(output, 'trusted-signing-metadata.json')), '%1',
  ]);
  const metadata = JSON.parse(readFileSync(join(output, 'trusted-signing-metadata.json'), 'utf8'));
  assert.deepEqual(metadata, {
    Endpoint: 'https://weu.codesigning.azure.net/', CodeSigningAccountName: 'test-account', CertificateProfileName: 'test-profile',
  });
  assert(!JSON.stringify({ config, metadata }).includes('must-not-be-written'));
});

test('missing signing tools or Azure metadata fail before producing a usable configuration', windows, t => {
  const directory = fixture(t);
  toolFiles(directory, false);
  const output = join(directory, 'output');
  const missingTool = powershell('tools/configure_windows_signing.ps1', ['-ToolRoot', directory, '-OutputDirectory', output], signingEnv);
  assert.notEqual(missingTool.status, 0);
  assert.match(missingTool.stdout + missingTool.stderr, /signing.*tool|dlib/i);
  assert(!existsSync(join(output, 'tauri.windows-signing.json')));
  toolFiles(directory);
  const missingMetadata = powershell('tools/configure_windows_signing.ps1', ['-ToolRoot', directory, '-OutputDirectory', output], { ...signingEnv, AZURE_PROFILE: '' });
  assert.notEqual(missingMetadata.status, 0);
  assert.match(missingMetadata.stdout + missingMetadata.stderr, /AZURE_PROFILE/);
  assert(!existsSync(join(output, 'tauri.windows-signing.json')));
});

test('the installed-file gate rejects missing, unsigned, tampered, untimestamped or wrong-publisher binaries', windows, t => {
  const directory = fixture(t);
  const result = powershell('tools/tests/windows-signatures.test.ps1', ['-FixtureDirectory', directory]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
