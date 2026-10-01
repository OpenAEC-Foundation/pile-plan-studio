import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PileCostSettings } from "../../core/projectTypes.ts";
import {
  applyPileCostCatalogDefault,
  mergePileCostCatalog,
  partitionPileCostItems,
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

  it("reports invalid preferred rows", () => {
    assert.match(validatePileCostItem({ pile_size_mm: -1, shape: "round", cost_per_m3: 200 }) ?? "", /positive/i);
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

  it("does not silently reinterpret the Rust-validated project catalog", () => {
    const canonicalProjectCatalog = {
      schema_version: 2,
      items: [{ pile_size_mm: 290, shape: "round", cost_per_m3: -1 }],
    } as PileCostSettings;

    const result = mergePileCostCatalog(
      canonicalProjectCatalog,
      null,
      null,
      new Set([290]),
    );

    assert.deepEqual(result.catalog, canonicalProjectCatalog);
    assert.deepEqual(result.skippedRows, []);
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
