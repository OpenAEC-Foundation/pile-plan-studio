import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importDiagnosticText } from "./importDiagnosticText.ts";

describe("import diagnostic text", () => {
  it("lists every invalid pile tip level with its source location", () => {
    const calls: Array<{ key: string; options?: Record<string, unknown> }> = [];
    const text = importDiagnosticText({
      severity: "error",
      code: "invalid-pile-tip-level-precision",
      count: 2,
      nodeIds: [],
      loadPointNames: [],
      xMm: null,
      yMm: null,
      location: null,
      tipLevelValues: [
        {
          value: "-18.5004",
          reason: "submillimetre",
          location: {
            fileName: "advies.xlsx",
            sheetName: "Blad1",
            row: 7,
            column: 3,
            columnName: "Puntniveau",
          },
        },
        {
          value: "-19.0006",
          reason: "submillimetre",
          location: {
            fileName: "advies.xlsx",
            sheetName: "Blad1",
            row: 9,
            column: 3,
            columnName: "Puntniveau",
          },
        },
      ],
      fallbackMessage: "Invalid levels.",
    }, (key, options) => {
      calls.push({ key, options });
      if (key.endsWith("sourceSheet")) return `sheet ${options?.sheet}`;
      if (key.endsWith("sourceRow")) return `row ${options?.row}`;
      if (key.endsWith("sourceColumn")) return `column ${options?.column}`;
      return String(options?.values ?? key);
    });

    assert.match(text, /-18\.5004 m \(advies\.xlsx, sheet Blad1, row 7, column 3\)/);
    assert.match(text, /-19\.0006 m \(advies\.xlsx, sheet Blad1, row 9, column 3\)/);
    assert.equal(calls.at(-1)?.key, "importProject.diagnostics.invalid-pile-tip-level-precision");
  });
});
