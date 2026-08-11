import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PileCostSettings } from "../core/projectTypes.ts";
import {
  addPileCostItem,
  applyPileCostCatalogDefault,
  mergePileCostCatalog,
  partitionPileCostItems,
  removePileCostItem,
  updatePileCostItem,
  validatePileCostItem,
} from "./pileCostCatalog.ts";

const catalog: PileCostSettings = {
  schema_version: 2,
  items: [
    { pile_size_mm: 290, shape: "round", cost_per_m3: 210 },
    { pile_size_mm: 320, shape: "square", cost_per_m3: 230 },
  ],
};

describe("pile cost catalog", () => {
  it("partitions used, unresolved and other pile sizes", () => {
    assert.deepEqual(partitionPileCostItems(catalog, new Set([290, 450])), {
      used: [catalog.items[0]],
      missingSizes: [450],
      other: [catalog.items[1]],
    });
  });

  it("requires unique positive pile sizes", () => {
    assert.throws(
      () => addPileCostItem(catalog, { pile_size_mm: 290, shape: "round", cost_per_m3: 200 }),
      /unique/i,
    );
    assert.match(validatePileCostItem({ pile_size_mm: -1, shape: "round", cost_per_m3: 200 }) ?? "", /positive/i);
  });

  it("protects rows used by the current project", () => {
    assert.throws(() => removePileCostItem(catalog, 290, new Set([290])), /in use/i);
    assert.deepEqual(removePileCostItem(catalog, 320, new Set([290])).items, [catalog.items[0]]);
  });

  it("updates one row immutably and keeps numeric ordering", () => {
    const next = updatePileCostItem(catalog, 320, { pile_size_mm: 250, cost_per_m3: 240 });

    assert.deepEqual(next.items.map((item) => item.pile_size_mm), [250, 290]);
    assert.equal(next.items[1], catalog.items[0]);
  });

  it("merges personal values over built-in values without deleting project-only rows", () => {
    const builtIn: PileCostSettings = {
      schema_version: 2,
      items: [
        { pile_size_mm: 290, shape: "square", cost_per_m3: 180 },
        { pile_size_mm: 350, shape: "square", cost_per_m3: 250 },
      ],
    };
    const personal: PileCostSettings = {
      schema_version: 2,
      items: [{ pile_size_mm: 290, shape: "round", cost_per_m3: 195 }],
    };

    const result = mergePileCostCatalog(catalog, personal, builtIn, new Set([290, 450]));

    assert.deepEqual(result.catalog.items, [
      { pile_size_mm: 290, shape: "round", cost_per_m3: 195 },
      catalog.items[1],
      { pile_size_mm: 350, shape: "square", cost_per_m3: 250 },
    ]);
    assert.deepEqual(result.unresolvedUsedSizes, [450]);
    assert.deepEqual(result.skippedRows, []);
  });

  it("reports and skips malformed preferred rows", () => {
    const malformed = {
      schema_version: 2,
      items: [
        { pile_size_mm: -1, shape: "round", cost_per_m3: 10 },
        { pile_size_mm: 400, shape: "triangle", cost_per_m3: -10 },
      ],
    } as unknown as PileCostSettings;

    const result = mergePileCostCatalog(catalog, malformed, null, new Set());

    assert.deepEqual(result.catalog, catalog);
    assert.equal(result.skippedRows.length, 2);
  });

  it("replaces unused project rows when explicitly loading a default", () => {
    const preferred: PileCostSettings = {
      schema_version: 2,
      items: [
        { pile_size_mm: 290, shape: "square", cost_per_m3: 180 },
        { pile_size_mm: 350, shape: "round", cost_per_m3: 250 },
      ],
    };

    const result = applyPileCostCatalogDefault(catalog, preferred, new Set([320]));

    assert.deepEqual(result.catalog.items, [
      preferred.items[0],
      catalog.items[1],
      preferred.items[1],
    ]);
  });
});
