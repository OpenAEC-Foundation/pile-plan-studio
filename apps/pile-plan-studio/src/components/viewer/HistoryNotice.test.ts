import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("viewer history notice", () => {
  it("renders history feedback as a pointer-transparent viewer notice", () => {
    const source = readFileSync(resolve(import.meta.dirname, "HistoryNotice.tsx"), "utf8");
    const css = readFileSync(resolve(import.meta.dirname, "HistoryNotice.css"), "utf8");

    assert.match(source, /aria-live="polite"/);
    assert.match(source, /key=\{noticeId\}/);
    assert.match(css, /position:\s*absolute/);
    assert.match(css, /left:\s*50%/);
    assert.match(css, /bottom:/);
    assert.match(css, /pointer-events:\s*none/);
    assert.match(css, /history-notice-fade/);
  });
});
