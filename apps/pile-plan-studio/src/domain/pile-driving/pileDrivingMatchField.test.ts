import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePileDrivingMatchField } from "./pileDrivingMatchField.ts";

test("defaults to pile number when the reference plan numbers any current location", () => {
  const targets = [{ load_point_id: 1 }, { load_point_id: 2, revit_mark: "002" }];
  assert.equal(resolvePileDrivingMatchField(targets, null), "revit-mark");
  assert.equal(resolvePileDrivingMatchField(targets, "location-id"), "location-id");
});

test("defaults to location ID for plans without pile numbers", () => {
  assert.equal(resolvePileDrivingMatchField([{ load_point_id: 1 }], null), "location-id");
});
