import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getSelectedCptTableModel } from "./cptSelectionTable.ts";
import type { Cpt, LoadPoint, SelectedCpt } from "../core/projectTypes.ts";

const cpt61: Cpt = { id: 61, name: "CPT 61", x_mm: 0, y_mm: 0 };
const cpt62: Cpt = { id: 62, name: "CPT 62", x_mm: 1000, y_mm: 0 };
const cpt63: Cpt = { id: 63, name: "CPT 63", x_mm: 2000, y_mm: 0 };
const loadPoint15: LoadPoint = { id: 15, name: "Load point 15", x_mm: 0, y_mm: 0, design_load_kn: 79 };
const loadPoint16: LoadPoint = { id: 16, name: "Load point 16", x_mm: 1000, y_mm: 0, design_load_kn: 82 };

function selectedCpt(label: string, cpt: Cpt, distance_mm: number): SelectedCpt {
  return { label, cpt, distance_mm };
}

describe("CPT selection table", () => {
  it("keeps selection and distance columns for one selected load point", () => {
    const model = getSelectedCptTableModel([
      {
        loadPoint: loadPoint15,
        selectedCpts: [selectedCpt("upper left", cpt61, 12340)],
      },
    ]);

    assert.deepEqual(model.columns, ["Selection", "CPT", "Distance"]);
    assert.deepEqual(model.rows, [
      {
        cpt: cpt61,
        values: ["upper left", "CPT 61", "12.3 m"],
      },
    ]);
  });

  it("falls back to the CPT id when an imported CPT has no name", () => {
    const unnamedCpt = { ...cpt61, name: "" };
    const model = getSelectedCptTableModel([{
      loadPoint: loadPoint15,
      selectedCpts: [selectedCpt("upper left", unnamedCpt, 12340)],
    }]);

    assert.equal(model.rows[0].values[1], "CPT 61");
  });

  it("replaces selection and distance with usage context for multiple selected load points", () => {
    const model = getSelectedCptTableModel([
      {
        loadPoint: loadPoint15,
        selectedCpts: [
          selectedCpt("upper left", cpt61, 12340),
          selectedCpt("lower right", cpt62, 7000),
        ],
      },
      {
        loadPoint: loadPoint16,
        selectedCpts: [selectedCpt("upper right", cpt61, 4500)],
      },
    ]);

    assert.deepEqual(model.columns, ["CPT", "Used by", "Load points"]);
    assert.deepEqual(model.rows, [
      {
        cpt: cpt61,
        values: ["CPT 61", "2 / 2 load points", "15, 16"],
      },
      {
        cpt: cpt62,
        values: ["CPT 62", "1 / 2 load points", "15"],
      },
    ]);
  });

  it("keeps the single-load-point columns while editing a manual draft", () => {
    const model = getSelectedCptTableModel([
      {
        loadPoint: loadPoint15,
        selectedCpts: [selectedCpt("manual", cpt61, 0)],
        isManualSelection: true,
      },
    ]);

    assert.deepEqual(model.columns, ["Selection", "CPT", "Distance"]);
    assert.deepEqual(model.rows, [{
      cpt: cpt61,
      values: ["manual", "CPT 61", "0 m"],
    }]);
  });

  it("sorts multiple-load-point CPTs by usage descending and CPT id ascending", () => {
    const loadPoint17 = { ...loadPoint16, id: 17, name: "Load point 17" };
    const model = getSelectedCptTableModel([
      {
        loadPoint: loadPoint15,
        selectedCpts: [
          selectedCpt("manual 1", cpt61, 1000),
          selectedCpt("manual 2", cpt62, 2000),
          selectedCpt("manual 3", cpt63, 3000),
        ],
      },
      {
        loadPoint: loadPoint16,
        selectedCpts: [selectedCpt("manual 1", cpt63, 2000)],
      },
      {
        loadPoint: loadPoint17,
        selectedCpts: [selectedCpt("manual 1", cpt62, 1000), selectedCpt("manual 2", cpt63, 2000)],
      },
    ]);

    assert.deepEqual(model.rows.map((row) => row.cpt.id), [63, 62, 61]);
    assert.deepEqual(model.rows.map((row) => row.values[1]), [
      "3 / 3 load points",
      "2 / 3 load points",
      "1 / 3 load points",
    ]);
  });
});
