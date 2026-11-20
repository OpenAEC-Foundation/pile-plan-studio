import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pileOptionAnalysisResultFromCore } from "./pileOptionAnalysisResult.ts";
import { binaryResultToUint8Array } from "./binaryCoreResult.ts";
import { isDesktopRuntime } from "../domain/project/projectPersistence.ts";
import {
  aggregatePileOptionsCore,
  applyLoadPointGroupAssignmentCore,
  applyLoadPointGroupEditCore,
  assessLoadPointGroupAssignmentsCore,
  assessTechnicalAssignmentCore,
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
  calculatePileCostCore,
  calculatePileOptionAnalysisCore,
  chooseDefaultPileOptionsCore,
  deriveLoadPointGroupsCore,
  exportPilePlanCsvCore,
  exportPilePlanXlsxCore,
  importProjectFromFilesCore,
  isTauriRuntime,
  previewImportSourceCore,
  previewLoadPointGroupEditCore,
  previewPilePlanImportCore,
  readProjectDocumentCore,
  refreshProjectFromFilesCore,
  writeProjectDocumentCore,
} from "./coreClient.ts";

describe("pile-option analysis core result", () => {
  it("accepts omitted CPT FRD rows from WASM recalculation", () => {
    const result = pileOptionAnalysisResultFromCore({
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

describe("core client public surface", () => {
  it("keeps every app-facing command available through the compatibility barrel", () => {
    const commands = [
      aggregatePileOptionsCore,
      applyLoadPointGroupAssignmentCore,
      applyLoadPointGroupEditCore,
      assessLoadPointGroupAssignmentsCore,
      assessTechnicalAssignmentCore,
      buildLoadPointTopologyCore,
      buildTipLevelRegionTopologyCore,
      calculatePileCostCore,
      calculatePileOptionAnalysisCore,
      chooseDefaultPileOptionsCore,
      deriveLoadPointGroupsCore,
      exportPilePlanCsvCore,
      exportPilePlanXlsxCore,
      importProjectFromFilesCore,
      isTauriRuntime,
      previewImportSourceCore,
      previewLoadPointGroupEditCore,
      previewPilePlanImportCore,
      readProjectDocumentCore,
      refreshProjectFromFilesCore,
      writeProjectDocumentCore,
    ];

    assert.equal(commands.every((command) => typeof command === "function"), true);
  });
});

describe("runtime detection", () => {
  it("uses the desktop runtime only in a top-level Tauri window", () => {
    const desktop = { __TAURI_INTERNALS__: {}, get top() { return this; } };
    const browser = { get top() { return this; } };
    const embedded = { __TAURI_INTERNALS__: {}, top: desktop };
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

    try {
      for (const [runtimeWindow, expected] of [[desktop, true], [browser, false], [embedded, false]] as const) {
        Object.defineProperty(globalThis, "window", { value: runtimeWindow, configurable: true });
        assert.equal(isTauriRuntime(), expected);
        assert.equal(isDesktopRuntime(), expected);
      }
    } finally {
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
