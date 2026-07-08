import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getCptMarkerLayerClass, getLoadPointMarkerLayerClass } from "./mapMarkerLayer.ts";

describe("map marker layer classes", () => {
  it("places selected CPTs above ordinary load points but below selected load points", () => {
    assert.equal(getCptMarkerLayerClass(false), " is-layer-cpt");
    assert.equal(getLoadPointMarkerLayerClass(false), " is-layer-load-point");
    assert.equal(getCptMarkerLayerClass(true), " is-layer-selected-cpt");
    assert.equal(getLoadPointMarkerLayerClass(true), " is-layer-selected-load-point");
  });
});
