import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("FeedbackDialog product target", () => {
  it("opens issues in the Pile Plan Studio repository", () => {
    const source = readFileSync(resolve(import.meta.dirname, "FeedbackDialog.tsx"), "utf8");

    assert.match(source, /const GITHUB_OWNER = "OpenAEC-Foundation"/);
    assert.match(source, /const GITHUB_REPO = "pile-plan-studio"/);
    assert.doesNotMatch(source, /OpenAEC-style-book/);
  });

  it("allows every non-empty feedback message", () => {
    const source = readFileSync(resolve(import.meta.dirname, "FeedbackDialog.tsx"), "utf8");

    assert.match(source, /const MIN_CHARS = 1;/);
    assert.match(source, /message\.trim\(\)\.length >= MIN_CHARS/);
  });
});
