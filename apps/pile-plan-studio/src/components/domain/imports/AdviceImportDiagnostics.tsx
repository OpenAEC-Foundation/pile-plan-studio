import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectImportPreview } from "../../../core/adviceImportContract.ts";
import { importDiagnosticText } from "../../../core/importDiagnosticText.ts";
import type { ImportDiagnostic } from "../../../core/coreImportContract.ts";
import { remainingAdviceDiagnostics } from "../../../domain/imports/adviceImportPresentation.ts";

function cellLabel(column: number, row: number): string {
  let col = column, label = "";
  while (col > 0) { col--; label = String.fromCharCode(65 + col % 26) + label; col = Math.floor(col / 26); }
  return `${label}${row}`;
}
export default function AdviceImportDiagnostics({ preview, sourceLabels = {}, alreadyShownDiagnostics = [] }: { preview: ProjectImportPreview; sourceLabels?: Record<string,string>; alreadyShownDiagnostics?: ImportDiagnostic[] }) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(preview.conflicts.length / 50)), current = Math.min(page, pages - 1);
  const sourceIds=[...new Set(preview.conflicts.flatMap(c => c.values.flatMap(v => v.locations.map(l => l.sourceId))))];
  const diagnostics = remainingAdviceDiagnostics(preview.diagnostics, alreadyShownDiagnostics)
    .filter(d => d.code !== "conflicting-bearing-capacities" || preview.conflicts.length === 0);
  return <section className="advice-import-diagnostics" aria-live="polite">
    {preview.countsAvailable && <p>{t("importProject.advice.totals", { count: preview.importedValueCount, duplicates: preview.exactDuplicateCount, orphans: preview.orphanValueCount })}</p>}
    {diagnostics.map((d, i) => <p className={d.severity === "error" ? "project-import-error" : ""} key={i}>{importDiagnosticText(d, t)}</p>)}
    {preview.conflicts.length > 0 && <>
      <h4>{t("importProject.advice.conflicts", { count: preview.conflicts.length })}</h4>
      <p>{t("importProject.advice.conflictHelp")}</p>
      <ol className="advice-conflict-list" start={current * 50 + 1}>
        {preview.conflicts.slice(current * 50, (current + 1) * 50).map(c => <li key={`${c.cptId}/${c.pileSizeMm}/${c.pileTipLevelMm}/${c.direction}/${c.pileCount}`}>
          <strong>{t("importProject.advice.configuration", { cpt: c.cptId, size: c.pileSizeMm, level: c.pileTipLevelMm / 1000 })}</strong> <span>{t(c.pileCount==null?"tableImport.allPileCounts":"tableImport.capPileCount")}{c.pileCount==null?"":`: ${c.pileCount}`}</span>
          {c.values.map((v, i) => <div key={i}><b>{v.missing?t("tableImport.missingResistance"):`${v.frdKn} kN`}</b>
            <ul>{v.locations.map((l, j) => <li key={j}>{l.fileName}{l.sheetName ? ` — ${l.sheetName}` : ""} — {l.column !== null && l.row !== null ? cellLabel(l.column, l.row) : t("importProject.advice.storedValue")} <small>({sourceLabels[l.sourceId] ?? t("importProject.advice.sourceNumber",{count:sourceIds.indexOf(l.sourceId)+1})})</small></li>)}</ul>
          </div>)}
        </li>)}
      </ol>
      {pages > 1 && <nav className="advice-conflict-pages" aria-label={t("importProject.advice.conflictPages")}>
        <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0}>{t("importProject.advice.previous")}</button>
        <span>{t("importProject.advice.page", { page: current + 1, pages })}</span>
        <button type="button" onClick={() => setPage(current + 1)} disabled={current + 1 === pages}>{t("importProject.advice.next")}</button>
      </nav>}
    </>}
  </section>;
}
