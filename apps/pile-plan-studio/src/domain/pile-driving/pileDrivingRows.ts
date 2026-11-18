import type { PileDrivingCheck, PileDrivingFileResult } from "../../core/pileDrivingCoreClient.ts";
import type { PileDrivingAssessment } from "./pileDrivingStatuses.ts";

export type PileDrivingWarning = PileDrivingCheck["kind"] | "manual-status";

export type PileDrivingDisplayFile = {
  id: string;
  name: string;
  result: PileDrivingFileResult | undefined;
};

const isWarning = (check: PileDrivingCheck) => check.status === "warning";

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

export function pileDrivingRows<T extends PileDrivingDisplayFile>(
  files: readonly T[], assessments?: ReadonlyMap<number, PileDrivingAssessment>,
) {
  const rows = files.flatMap(file => {
    if (file.result?.status !== "ready") return [];
    const { columns, records } = file.result.preview;
    const dateColumn = columns.indexOf("datum");
    return records.map((record, rowIndex) => {
      const warnings: PileDrivingWarning[] = record.checks.filter(isWarning).map(check => check.kind);
      if (record.matching.status === "matched" && assessments?.get(record.matching.load_point_id)?.manual) {
        warnings.unshift("manual-status");
      }
      return {
        file, columns, record, rowIndex, warnings,
        date: drivingDate(record.rows[0]?.[dateColumn]),
        unavailable: record.checks.filter(check => check.status === "unavailable").length,
      };
    });
  });
  const dates = [...new Set(rows.flatMap(row => row.date ? [row.date] : []))].sort();
  const dayByDate = new Map(dates.map((date, index) => [date, index + 1]));
  return rows.map(row => ({ ...row, day: row.date ? dayByDate.get(row.date) ?? null : null }))
    .sort((a, b) => b.warnings.length - a.warnings.length
      || (a.day ?? Number.MAX_SAFE_INTEGER) - (b.day ?? Number.MAX_SAFE_INTEGER));
}
