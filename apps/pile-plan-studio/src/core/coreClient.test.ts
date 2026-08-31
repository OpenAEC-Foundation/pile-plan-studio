import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { projectAnalysisResultFromCore } from "./projectAnalysisResult.ts";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";

describe("project analysis core result", () => {
  it("accepts omitted CPT FRD rows from WASM recalculation", () => {
    const result = projectAnalysisResultFromCore({
      pile_options_by_load_point: new Map(),
      selected_cpts_by_load_point: new Map(),
      cpt_frd_rows_by_cpt_id: undefined,
    });

    assert.deepEqual(result.pileOptionsByLoadPointId, new Map());
    assert.deepEqual(result.selectedCptsByLoadPointId, new Map());
    assert.equal(result.cptFrdRowsByCptId, null);
  });
});

describe("binary core result", () => {
  it("normalizes browser and Tauri byte collections", () => {
    assert.deepEqual(binaryResultToUint8Array(new Uint8Array([1, 2, 3])), new Uint8Array([1, 2, 3]));
    assert.deepEqual(binaryResultToUint8Array([4, 5, 6]), new Uint8Array([4, 5, 6]));
  });
});

describe("project source refresh core contract", () => {
  it("passes required project properties through new-project imports", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");
    const start = source.indexOf("export async function importProjectFromFilesCore");
    const handler = source.slice(start, source.indexOf("export async function refreshProjectFromFilesCore", start));

    assert.match(handler, /pileHeadLevelM/);
    assert.match(handler, /currencyCode/);
    assert.match(handler, /pile_head_level_m/);
    assert.match(handler, /currency_code/);
  });
  it("converts persisted numeric record keys before refreshing in WASM", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");

    assert.match(source, /refresh_project_from_files/);
    assert.match(source, /current_project:\s*toWasmIfcppProject\(input\.currentProject\)/);
    assert.match(source, /sources:\s*input\.sources\.map\(toCoreImportSource\)/);
    assert.match(source, /invoke<IfcppProject>\("refresh_project_from_files"/);
  });

  it("converts persisted optimizer outcome keys before writing in WASM", () => {
    const source = readFileSync(new URL("./coreClient.ts", import.meta.url), "utf8");
    const start = source.indexOf("function toWasmIfcppProject");
    const converter = source.slice(start, source.indexOf("async function exportPilePlanCore", start));

    assert.match(
      converter,
      /optimization_unassigned:\s*toWasmNumberKeyedRecord\(\s*plan\.optimization_unassigned\s*\?\?\s*\{\}/,
    );
  });
});
