import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("React app startup", () => {
  it("does not run the expensive WASM initialization twice in development", () => {
    const source = readFileSync(resolve(import.meta.dirname, "main.tsx"), "utf8");

    assert.doesNotMatch(source, /React\.StrictMode/);
  });
});
