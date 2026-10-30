import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  emptyImportFileAssignments,
  inferImportFileAssignments,
  inferImportFileRole,
  inferImportFileSelections,
  getImportFileFormat,
} from "./importFiles.ts";

describe("import file assignments", () => {
  it("supports CSV and XLSX independently from the suggested role", () => {
    assert.equal(inferImportFileRole("belastinglocaties.xlsx"), "load-points");
    assert.equal(inferImportFileRole("sonderingen.csv"), "cpts");
    assert.equal(inferImportFileRole("draagvermogens.csv"), "bearing-capacities");
    assert.equal(inferImportFileRole("anything.csv"), null);
    assert.equal(getImportFileFormat("anything.csv"), "csv");
    assert.equal(getImportFileFormat("anything.xlsx"), "xlsx");
    assert.equal(getImportFileFormat("anything.xls"), null);
  });
  it("infers file roles from common project file names", () => {
    assert.equal(inferImportFileRole("Belastinglocaties.csv"), "load-points");
    assert.equal(inferImportFileRole("Sonderingen.xlsx"), "cpts");
    assert.equal(inferImportFileRole("Draagvermogens.xlsx"), "bearing-capacities");
    assert.equal(inferImportFileRole("bearing-capacities.xlsx"), "bearing-capacities");
    assert.equal(inferImportFileRole("Export RFEM.xlsx"), "load-points");
    assert.equal(inferImportFileRole("notes.txt"), null);
  });

  it("assigns three selected files to the import roles", () => {
    const assignments = inferImportFileAssignments([
      { name: "Draagvermogens.xlsx" },
      { name: "Belastinglocaties.csv" },
      { name: "Sonderingen.xlsx" },
    ]);

    assert.equal(assignments["load-points"]?.name, "Belastinglocaties.csv");
    assert.equal(assignments.cpts?.name, "Sonderingen.xlsx");
    assert.equal(assignments["bearing-capacities"]?.name, "Draagvermogens.xlsx");
  });

  it("keeps manually assigned files when bulk assignment cannot improve them", () => {
    const current = {
      ...emptyImportFileAssignments<{ name: string }>(),
      "load-points": { name: "my-loads.csv" },
    };

    const assignments = inferImportFileAssignments([{ name: "Belastinglocaties.csv" }], current);

    assert.equal(assignments["load-points"]?.name, "my-loads.csv");
  });
});

const vegaAdviceNames = [
  "120488 Amsterdam prefab betonpalen 70 cm ophoging trek diep 2paalspoer.xlsx",
  "120488 Amsterdam prefab betonpalen 70 cm ophoging trek diep 4paalspoer.xlsx",
  "120488 Amsterdam prefab betonpalen 70 cm ophoging trek ondiep.xlsx",
];

it("recognizes advice and resistance filenames including all VEGA tension workbooks", () => {
  for (const name of [...vegaAdviceNames, "Funderingsadvies.xlsx", "Trekvermogens.xlsx", "Drukweerstanden.csv", "Foundation advice.xlsx", "tension-resistance.xlsx", "draagcapaciteiten.xlsx", "Funderingsadvies sonderingen.xlsx"]) {
    assert.equal(inferImportFileRole(name), "bearing-capacities", name);
  }
  for (const name of ["Trekbelastingen.csv", "Trekkrachten.xlsx", "Export RFEM.xlsx"]) {
    assert.equal(inferImportFileRole(name), "load-points", name);
  }
  assert.equal(inferImportFileRole("Funderingsadvies.pdf"), null);
  assert.equal(inferImportFileRole("overzicht.xlsx"), null);
});

it("retains every advice file in a mixed batch and preserves existing load and CPT choices", () => {
  const load = {name: "handmatig gekozen belastingen.csv"}, cpts = {name: "handmatig gekozen sonderingen.xlsx"};
  const advice = vegaAdviceNames.map(name => ({name}));
  const selected = inferImportFileSelections([{name: "Export RFEM.xlsx"}, ...advice, {name: "Sonderingen.xlsx"}], {...emptyImportFileAssignments(), "load-points":load, cpts});
  assert.deepEqual(selected.adviceFiles, advice);
  assert.equal(selected.assignments["load-points"], load);
  assert.equal(selected.assignments.cpts, cpts);
  assert.equal(selected.assignments["bearing-capacities"], null);
});
