import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importProfileChoices } from "./importProfileChoices.ts";

describe("import profile choices", () => {
  it("offers RFEM for load points before a file is selected", () => {
    assert.deepEqual(
      importProfileChoices(null, "load-points", null),
      ["auto", "standard-table", "rfem-export"],
    );
  });

  it("limits RFEM to XLSX load-point sources", () => {
    assert.deepEqual(
      importProfileChoices("Belastinglocaties.csv", "load-points", null),
      ["auto", "standard-table"],
    );
    assert.deepEqual(
      importProfileChoices("Export RFEM.xlsx", "load-points", null),
      ["auto", "standard-table", "rfem-export"],
    );
  });

  it("does not offer RFEM for other project roles", () => {
    assert.deepEqual(
      importProfileChoices(null, "cpts", null),
      ["auto", "standard-table"],
    );
  });
});
