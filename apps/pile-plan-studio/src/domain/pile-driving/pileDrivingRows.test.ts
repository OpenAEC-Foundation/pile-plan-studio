import assert from "node:assert/strict";
import { test } from "node:test";
import type { PileDrivingFileResult } from "../../core/pileDrivingCoreClient.ts";
import { pileDrivingRows } from "./pileDrivingRows.ts";

function file(number: string, warning: boolean, date?: string): PileDrivingFileResult {
  return { status: "ready", preview: {
    columns: ["paalnummer", "datum"],
    records: [{
      pile_number: number,
      rows: [[number, date ?? ""]],
      matching: { status: "matched", load_point_id: Number(number) },
      checks: [{ kind: "size", status: warning ? "warning" : "ok" }],
    }],
  } };
}

test("sorts warnings across logs while preserving the source of each registration", () => {
  const logs = [
    { id: "day-1", name: "first.csv", result: file("15", false) },
    { id: "day-2", name: "second.csv", result: file("65", true) },
    { id: "day-3", name: "unreadable.csv", result: { status: "failed", error: { code: "unreadable" } } as const },
  ];
  const rows = pileDrivingRows(logs);
  assert.deepEqual(rows.map(row => [row.file.id, row.file.name, row.rowIndex, row.record.pile_number]), [
    ["day-2", "second.csv", 0, "65"],
    ["day-1", "first.csv", 0, "15"],
  ]);
});

test("numbers distinct driving dates in chronological order across files", () => {
  const rows = pileDrivingRows([
    { id: "a", name: "later.csv", result: file("1", true, "12-11-2026") },
    { id: "b", name: "earlier.csv", result: file("2", false, "9-11-2026") },
    { id: "c", name: "same-date.xlsx", result: file("3", false, "2026-11-12T09:30:00") },
    { id: "d", name: "unknown.csv", result: file("4", false, "31-11-2026") },
  ]);
  assert.deepEqual(rows.map(row => [row.file.id, row.day, row.date]), [
    ["a", 2, "2026-11-12"],
    ["b", 1, "2026-11-09"],
    ["c", 2, "2026-11-12"],
    ["d", null, null],
  ]);
});
