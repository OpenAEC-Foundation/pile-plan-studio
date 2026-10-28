import {render, screen} from "@testing-library/react";
import {expect, test} from "vitest";
import "../../../i18n/config.ts";
import ExportTablePreview from "./ExportTablePreview.tsx";

test("empty browser/WASM and native cells stay blank while zero and false remain values", () => {
  render(<ExportTablePreview table={{headers: ["Mark", "Meta", "Flag", "Zero"], rows: [[null, undefined as unknown as null, false, 0]]}}/>);
  expect(screen.getAllByRole("cell").map(cell => cell.textContent)).toEqual(["", "", "No", "0"]);
});
