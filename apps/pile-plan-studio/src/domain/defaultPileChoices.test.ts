import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mergeDefaultPileChoices } from "./defaultPileChoices.ts";

describe("mergeDefaultPileChoices", () => {
  it("fills missing defaults without replacing retained choices", () => {
    const retained = new Map([[1, "290|-18"]]);
    const defaults = new Map([[1, "320|-20"], [2, "290|-17.5"]]);

    const merged = mergeDefaultPileChoices(retained, defaults);

    assert.deepEqual([...merged], [[1, "290|-18"], [2, "290|-17.5"]]);
    assert.deepEqual([...retained], [[1, "290|-18"]]);
    assert.deepEqual([...defaults], [[1, "320|-20"], [2, "290|-17.5"]]);
  });
});
