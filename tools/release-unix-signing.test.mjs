import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
for (const [script, variable] of [['sign_linux_artifacts.sh','OPENAEC_GPG_PRIVATE_KEY'],['prepare_macos_signing.sh','APPLE_CERTIFICATE']]) {
  test(script + ' rejects unavailable credentials before touching signing tools', {skip:process.platform === 'win32' && !existsSync(bash) ? 'Git Bash is unavailable' : false}, () => {
    assert.ok(existsSync(new URL(script, import.meta.url)));
    const result = spawnSync(bash, ['tools/'+script, '.'], {cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', env:{...process.env,[variable]:''}, windowsHide:true});
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, new RegExp(variable));
  });
}
