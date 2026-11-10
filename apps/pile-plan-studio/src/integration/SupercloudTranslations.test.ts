import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Docs and the SuperCloud assistant have English and Dutch copy", () => {
  for (const lang of ["nl", "en"]) {
    const url = new URL(`../i18n/locales/${lang}/common.json`, import.meta.url);
    const { supercloud } = JSON.parse(readFileSync(url, "utf8"));
    for (const key of ["open", "loading", "empty", "listFailed", "unavailable", "openFailed", "saveFailed",
      "saved", "currentFile", "readOnly", "saveAs", "fileName", "unsaved", "assistant"]) {
      assert.ok(supercloud[key]?.trim(), `${lang}: supercloud.${key}`);
    }
    for (const key of ["saved", "currentFile", "readOnly"]) assert.match(supercloud[key], /{{name}}/);
  }
});
