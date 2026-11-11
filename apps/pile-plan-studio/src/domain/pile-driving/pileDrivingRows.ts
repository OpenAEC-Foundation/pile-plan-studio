import type { PileDrivingCheck, PileDrivingFileResult } from "../../core/pileDrivingCoreClient.ts";

export type PileDrivingDisplayFile = {
  id: string;
  name: string;
  result: PileDrivingFileResult | undefined;
};

const isWarning = (check: PileDrivingCheck) => check.status === "warning";

export function getPileDrivingWarningLocationIds(
  files: readonly PileDrivingDisplayFile[], selectedId: string | null,
): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const file of files) {
    if ((selectedId !== null && file.id !== selectedId) || file.result?.status !== "ready") continue;
    for (const { matching, checks } of file.result.preview.records) {
      if (matching.status === "matched" && checks.some(isWarning)) ids.add(matching.load_point_id);
    }
  }
  return ids;
}

function drivingDate(value: string | undefined): string | null {
  const input = value?.trim() ?? "";
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?=$|[T ])/.exec(input);
  const dutch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(input);
  const [year, month, day] = iso?.slice(1) ?? dutch?.slice(1).reverse() ?? [];
  if (!year || !month || !day) return null;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().startsWith(`${normalized}T`)
    ? normalized : null;
}

export function pileDrivingRows(files: readonly PileDrivingDisplayFile[]) {
  const rows = files.flatMap(file => {
    if (file.result?.status !== "ready") return [];
    const { columns, records } = file.result.preview;
    const dateColumn = columns.indexOf("datum");
    return records.map((record, rowIndex) => ({
      file, columns, record, rowIndex,
      date: drivingDate(record.rows[0]?.[dateColumn]),
      warnings: record.checks.filter(isWarning).map(check => check.kind),
      unavailable: record.checks.filter(check => check.status === "unavailable").length,
    }));
  });
  const dates = [...new Set(rows.flatMap(row => row.date ? [row.date] : []))].sort();
  const dayByDate = new Map(dates.map((date, index) => [date, index + 1]));
  return rows.map(row => ({ ...row, day: row.date ? dayByDate.get(row.date) ?? null : null }))
    .sort((a, b) => b.warnings.length - a.warnings.length
      || (a.day ?? Number.MAX_SAFE_INTEGER) - (b.day ?? Number.MAX_SAFE_INTEGER));
}
