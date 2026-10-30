import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { initSync } from "./wasm/pile-plan-wasm/pile_plan_wasm.js";
import type { PileCostSettings } from "./projectTypes.ts";

import {
  aggregatePileOptionsCore,
  assessTechnicalAssignmentCore,
  buildLoadPointTopologyCore,
  buildTipLevelRegionTopologyCore,
  calculatePileCostCore,
  calculatePileOptionAnalysisCore,
  chooseDefaultPileOptionsCore,
} from "./analysisCoreClient.ts";

describe("analysis core client", () => {
  it("owns the analysis-facing commands", () => {
    assert.equal([
      aggregatePileOptionsCore,
      assessTechnicalAssignmentCore,
      buildLoadPointTopologyCore,
      buildTipLevelRegionTopologyCore,
      calculatePileCostCore,
      calculatePileOptionAnalysisCore,
      chooseDefaultPileOptionsCore,
    ].every((command) => typeof command === "function"), true);
  });

  const settings: PileCostSettings = {
    schema_version: 2,
    items: [
      { pile_size_mm: 320, shape: "square", cost_per_m3: 205 },
      { pile_size_mm: 400, shape: "square", cost_per_m3: 0 },
    ],
  };
  const cases = [
    { pileSizeMm: 450, expected: null },
    { pileSizeMm: 400, expected: 0 },
    { pileSizeMm: 320, expected: 304 },
  ];

  it("returns null for a missing WASM price while preserving zero and known prices", async () => {
    initSync({ module: readFileSync(new URL("./wasm/pile-plan-wasm/pile_plan_wasm_bg.wasm", import.meta.url)) });
    for (const { pileSizeMm, expected } of cases) {
      assert.equal(await calculatePileCostCore({
        pileSizeMm, pileTipLevelM: -18, pileHeadLevelM: -3.5, settings,
      }), expected, `pile size ${pileSizeMm}`);
    }
  });

  it("preserves null, zero and known prices from desktop IPC", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {} as Window & typeof globalThis;
    mockIPC((command, payload) => {
      assert.equal(command, "calculate_pile_option_cost");
      const { pile_size_mm } = (payload as { request: { pile_size_mm: number } }).request;
      const fixture = cases.find(({ pileSizeMm }) => pileSizeMm === pile_size_mm);
      assert.ok(fixture);
      return { cost: fixture.expected };
    });
    try {
      for (const { pileSizeMm, expected } of cases) {
        assert.equal(await calculatePileCostCore({
          pileSizeMm, pileTipLevelM: -18, pileHeadLevelM: -3.5, settings,
        }), expected, `pile size ${pileSizeMm}`);
      }
    } finally {
      clearMocks();
      globalThis.window = previousWindow;
    }
  });
});
