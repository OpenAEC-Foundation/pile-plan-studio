import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScaledDecimal } from "./ilpSettingsModel.ts";
test("decimal controls preserve exact precision and reject invalid values", () => {
  for (const [text,decimals,want] of [["5",2,500],["3,25",2,325],["0.125",3,125],["0",3,0],
    ["-1",3,null],["0.0001",3,null],["1e3",2,null],["",2,null],["NaN",2,null]] as const) {
    assert.equal(parseScaledDecimal(text,decimals),want,text);
  }
});
