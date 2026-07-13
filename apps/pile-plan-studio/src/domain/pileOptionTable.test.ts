import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  FILTERABLE_PILE_OPTION_COLUMNS,
  PILE_OPTION_COLUMNS,
  SORTABLE_PILE_OPTION_COLUMNS,
  createEmptyPileOptionFilters,
  getNextPileOptionSortState,
  getPileOptionFilterValues,
  getPileOptionTableRows,
  type PileOptionTableRow,
} from "./pileOptionTable.ts";

describe("pile option table", () => {
  const rows: PileOptionTableRow[] = [
    row({ key: "290|-18", costValue: 900, statusLabel: "OK", sizeValue: 290, tipValue: -18 }),
    row({ key: "350|-20", costValue: 700, statusLabel: "Not OK", sizeValue: 350, tipValue: -20 }),
    row({ key: "320|-19", costValue: null, statusLabel: "Missing", sizeValue: 320, tipValue: -19 }),
  ];

  it("defines the requested table column order", () => {
    assert.deepEqual(
      PILE_OPTION_COLUMNS.map((column) => column.label),
      ["Symbol", "Size", "Tip", "Status", "Cost", "Use", "Governing", "R_c;net;d min"],
    );
  });

  it("does not sort or filter the symbol column", () => {
    assert.deepEqual(
      SORTABLE_PILE_OPTION_COLUMNS.map((column) => column.key),
      ["size", "tip", "status", "cost", "use", "governing", "frd"],
    );
    assert.deepEqual(
      FILTERABLE_PILE_OPTION_COLUMNS.map((column) => column.key),
      ["size", "tip", "status", "cost", "use", "governing", "frd"],
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
    assert.deepEqual(getPileOptionFilterValues(rows, "status"), ["Missing", "Not OK", "OK"]);
  });

  it("toggles sorting direction when clicking the active column again", () => {
    assert.deepEqual(getNextPileOptionSortState({ column: "size", direction: "asc" }, "size"), {
      column: "size",
      direction: "desc",
    });
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
    governingLabel: "CPT 1",
    key: input.key,
    sizeLabel: `${input.sizeValue} mm`,
    sizeValue: input.sizeValue,
    statusLabel: input.statusLabel,
    symbolLabel: `${input.sizeValue} mm ${input.tipValue} m`,
    tipLabel: `${input.tipValue} m`,
    tipValue: input.tipValue,
    useLabel: "10%",
    useValue: 0.1,
  };
}
