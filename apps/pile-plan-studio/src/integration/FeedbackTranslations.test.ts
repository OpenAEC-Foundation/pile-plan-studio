import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("account-free public feedback has complete Dutch and English copy and image limits", () => {
  const languages = ["nl", "en"].map(language => JSON.parse(readFileSync(resolve(import.meta.dirname, `../i18n/locales/${language}/feedback.json`), "utf8")));
  for (const copy of languages) {
    for (const key of ["publicNotice","contactHint","message","messageHelp","captureScreenshot","capturing","storedMessage","issueCreated","viewIssue",
      "imagePreview","removeImage","environment","errorRateLimit","errorDuplicate","errorRejected","errorGeneric","errorImageType","errorImagesSize","errorImagesCount","errorScreenshot"]) {
      assert.ok(copy[key]?.trim(), key);
    }
    assert.match(copy.publicNotice, /GitHub/); assert.match(copy.imageLimit, /3.*1 MB/);
    assert.match(copy.environment, /\{\{appVersion\}\}/); assert.match(copy.environment, /\{\{osInfo\}\}/);
    assert.match(copy.imagePreview, /\{\{number\}\}.*\{\{name\}\}/);
  }
  assert.match(languages[0].publicNotice, /openbaar.*geen GitHub-account/);
  assert.ok(languages[0].contactHint.includes("E\u2011mail"));
  assert.doesNotMatch(languages[0].contactHint, /e-mail/i);
  assert.match(languages[1].publicNotice, /public.*not need a GitHub account/);
});
