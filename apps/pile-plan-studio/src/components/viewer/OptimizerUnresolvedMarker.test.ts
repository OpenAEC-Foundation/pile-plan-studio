import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("optimizer unresolved marker", () => {
  it("keeps one centered question mark and adds candidates only in detailed mode", () => {
    const source = readFileSync(resolve(import.meta.dirname, "OptimizerUnresolvedMarker.tsx"), "utf8");

    assert.match(source, /viewBox="-12 -12 24 24"/);
    assert.match(source, /optimizer-marker-question/);
    assert.match(source, /detailed \?/);
    assert.match(source, /optimizer-marker-candidates/);
    assert.match(source, /marker-halo/);
    assert.match(source, /marker-foreground/);
    assert.doesNotMatch(source, /<rect|optimizer-marker-container/);
  });

  it("provides the optimizer-limit tooltip in Dutch and English", () => {
    const dutch = JSON.parse(readFileSync(
      resolve(import.meta.dirname, "../../i18n/locales/nl/common.json"),
      "utf8",
    ));
    const english = JSON.parse(readFileSync(
      resolve(import.meta.dirname, "../../i18n/locales/en/common.json"),
      "utf8",
    ));

    assert.match(dutch.viewer.optimizerUnassigned, /laatste optimalisatie.*ingestelde limieten/i);
    assert.match(english.viewer.optimizerUnassigned, /last optimization.*configured limits/i);
  });
});
