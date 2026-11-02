import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
for (const operation of ['staple', 'validate']) for (const succeeds of [true, false]) {
  test('Apple ticket ' + operation + ' ' + (succeeds ? 'recovers from transient failures' : 'fails after bounded retries'), {
    skip: process.platform === 'win32' && !existsSync(bash) ? 'Git Bash unavailable' : false,
  }, t => {
    const directory = mkdtempSync(join(tmpdir(), 'pile-stapler-'));
    t.after(() => {
      assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
      rmSync(directory, { recursive:true, force:true });
    });
    const result = spawnSync(bash, ['-c', `
      codesign() { return 0; }
      python3() { return 0; } # Accepted notarization is a precondition of these retry tests.
      sleep() { return 0; }
      xcrun() {
        if [[ "$1" == notarytool ]]; then printf '{"status":"Accepted"}'; return 0; fi
        local count=0
        if [[ -f "$RUNNER_TEMP/count" ]]; then read -r count < "$RUNNER_TEMP/count"; fi
        count=$((count+1))
        printf '%s\\n' "$count" > "$RUNNER_TEMP/count"
        if [[ "$RECOVER" == true && "$count" -eq 3 ]]; then return 0; fi
        return 68
      }
      export -f codesign python3 sleep xcrun
      if [[ "$OPERATION" == staple ]]; then
        bash tools/notarize_macos_dmg.sh test.dmg
      else
        source tools/apple_ticket.sh
        apple_ticket validate test.app
      fi
    `], {cwd:fileURLToPath(new URL('../', import.meta.url)), encoding:'utf8', windowsHide:true,
      env:{...process.env, RUNNER_TEMP:directory.replaceAll('\\','/'), RECOVER:String(succeeds), OPERATION:operation,
        APPLE_SIGNING_IDENTITY:'fixture', APPLE_API_KEY_PATH:'fixture', APPLE_API_KEY:'fixture', APPLE_API_ISSUER:'fixture'}});
    assert.equal(result.status, succeeds ? 0 : 68, result.stdout + result.stderr);
    assert.equal(readFileSync(join(directory,'count'),'utf8').trim(), '3');
  });
}
