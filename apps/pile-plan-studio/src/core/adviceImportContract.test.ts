import { test } from "node:test";
import assert from "node:assert/strict";
import { toCoreImportSource } from "./coreImportContract.ts";
import { sourceImportErrorFromUnknown } from "./adviceImportContract.ts";

test("advice selection preserves explicit empty versus missing and stable identity", () => {
  const source = { sourceId: "a", role: "bearing-capacities" as const, profile: "auto" as const,
    profileOptions: { coordinateSheet: null, reactionSheet: null, adviceSheets: [] },
    fileName: "advies.xlsx", format: "xlsx" as const, bytes: new Uint8Array() };
  assert.deepEqual(toCoreImportSource(source).profile_options.advice_sheets, []);
  assert.equal(toCoreImportSource(source).source_id, "a");
});
test("structured final errors retain all conflict values and physical locations", () => {
  const result = sourceImportErrorFromUnknown({ message: "Conflict", diagnostics: [], conflicts: [
    { cpt_id: 1, pile_size_mm: 290, pile_tip_level_mm: -15000, values: [
      { frd_kn: 500, locations: [{ source_id: "a", file_name: "a.xlsx", sheet_name: "diep", row: 7, column: 4 }] },
      { frd_kn: 600, locations: [{ source_id: "b", file_name: "a.xlsx", sheet_name: "diep", row: 9, column: 4 }] },
    ] },
  ] });
  assert.equal(result?.conflicts[0].values[1].locations[0].row, 9);
  assert.equal(result?.message, "Conflict");
});
