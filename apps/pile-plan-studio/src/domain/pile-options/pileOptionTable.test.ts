import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyPileOptionFilters,
  getNextPileOptionSortState,
  getPileOptionColumns,
  getPileOptionFilterValues,
  getPileOptionTableRows,
  type PileOptionTableRow,
} from "./pileOptionTable.ts";

describe("pile option table", () => {
  const rows: PileOptionTableRow[] = [
    row({ key: "290|-18", costValue: 900, statusLabel: "OK", sizeValue: 290, tipValue: -18 }),
    row({ key: "350|-20", costValue: 700, statusLabel: "Insufficient capacity", sizeValue: 350, tipValue: -20 }),
    row({ key: "320|-19", costValue: null, statusLabel: "Missing", sizeValue: 320, tipValue: -19 }),
  ];

  it("keeps governing CPT and FRd for a single location", () => {
    assert.deepEqual(
      getPileOptionColumns(1).map((column) => column.key),
      ["symbol", "size", "tip", "status", "cost", "use", "governing", "frd"],
    );
  });

  it("shows critical multiselection facts instead of averages and governing CPT", () => {
    assert.deepEqual(
      getPileOptionColumns(2).map((column) => column.key),
      ["symbol", "size", "tip", "status", "totalCost", "maxUse", "criticalLoadPoint"],
    );
  });

  it("sorts numeric columns and keeps missing values last", () => {
    assert.deepEqual(
      getPileOptionTableRows(rows, createEmptyPileOptionFilters(), { column: "cost", direction: "asc" }).map(
        (item) => item.key,
      ),
      ["350|-20", "290|-18", "320|-19"],
    );
  });

  it("filters rows by selected column values", () => {
    const filters = createEmptyPileOptionFilters();
    filters.status = ["Missing"];

    assert.deepEqual(
      getPileOptionTableRows(rows, filters, null).map((item) => item.key),
      ["320|-19"],
    );
  });

  it("allows multiple values within one column", () => {
    const filters = createEmptyPileOptionFilters();
    filters.status = ["OK", "Missing"];

    assert.deepEqual(
      getPileOptionTableRows(rows, filters, null).map((item) => item.key),
      ["290|-18", "320|-19"],
    );
  });

  it("combines filters across columns", () => {
    const filters = createEmptyPileOptionFilters();
    filters.status = ["OK", "Missing"];
    filters.size = ["290 mm"];

    assert.deepEqual(
      getPileOptionTableRows(rows, filters, null).map((item) => item.key),
      ["290|-18"],
    );
  });

  it("lists unique filter values for a column", () => {
    assert.deepEqual(getPileOptionFilterValues(rows, "status"), ["Insufficient capacity", "Missing", "OK"]);
  });

  it("cycles sorting from ascending to descending to disabled", () => {
    const descending = getNextPileOptionSortState({ column: "size", direction: "asc" }, "size");
    assert.deepEqual(descending, {
      column: "size",
      direction: "desc",
    });
    assert.equal(getNextPileOptionSortState(descending, "size"), null);
  });
});

function row(input: {
  key: string;
  costValue: number | null;
  statusLabel: string;
  sizeValue: number;
  tipValue: number;
}): PileOptionTableRow {
  return {
    costLabel: input.costValue === null ? "-" : `${input.costValue}`,
    costValue: input.costValue,
    frdLabel: "800 kN",
    frdValue: 800,
    criticalLoadPointId: 1,
    criticalLoadPointLabel: "Load point 1",
    governingLabel: "CPT 1",
    missingCptIds: [],
    key: input.key,
    sizeLabel: `${input.sizeValue} mm`,
    sizeValue: input.sizeValue,
    statusLabel: input.statusLabel,
    symbolLabel: `${input.sizeValue} mm ${input.tipValue} m`,
    tipLabel: `${input.tipValue} m`,
    tipValue: input.tipValue,
    totalCostLabel: input.costValue === null ? "-" : `${input.costValue}`,
    totalCostValue: input.costValue,
    maxUseLabel: "10%",
    maxUseValue: 0.1,
    useLabel: "10%",
    useValue: 0.1,
  };
}
