import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  areImportFileAssignmentsComplete,
  emptyImportFileAssignments,
  inferImportFileAssignments,
  inferImportFileRole,
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
    assert.equal(areImportFileAssignmentsComplete(assignments), true);
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
